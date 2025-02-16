from flask import Flask, redirect, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.exc import IntegrityError
from pymongo import MongoClient
from functools import lru_cache
import os
import random, string
from datetime import datetime, timedelta, timezone
from apscheduler.schedulers.background import BackgroundScheduler
import atexit

app = Flask(__name__)

# URL Key Generator Service
# SQL db to ensure isolation and atomic transactions for concurrency issues

app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///short_codes.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)

class KeyPool(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    short_code = db.Column(db.String(8), unique=True, nullable=False)
    used = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f"<KeyPool {self.short_code} used={self.used}"

with app.app_context():
    db.create_all()

def generate_short_code(length=8):
    allowed_chars = string.ascii_letters + string.digits
    return "".join(random.choices(allowed_chars, k=length))

def allocate_key():
    '''
    - with db.session.begin_nested()
    Creates a transaction that is atomic (all or nothing).
    If an error occurs, no partial changes happen. (session.rollback reverts everything)  

    - .with_for_update()
    Locks the row so that no other transaction can modify or read it until this transaction is done.
    Ensures that two users don’t get the same short code.
    '''
    try:
        with db.session.begin_nested():
            key_entry = KeyPool.query.filter_by(used=False).with_for_update().first()

        if not key_entry:
            new_code = generate_short_code()
            key_entry = KeyPool(short_code=new_code, used=False)
            db.session.add(key_entry)

        key_entry.used = True
        db.session.commit()
        return key_entry.short_code
    
    except IntegrityError:
        db.session.rollback()
        return allocate_key()

def recycle_key(short_code):
    key_entry = KeyPool.query.filter_by(short_code=short_code).first()
    if key_entry:
        key_entry.used = False
        try:
            db.session.commit()
        except:
            db.session.rollback()


MONGO_URI = os.environ.get("MONGO_URI",  "mongodb://localhost:27017/")
mongo_client = MongoClient(MONGO_URI)

mapping_db = mongo_client["tinyurl_db"]
url_mapping = mapping_db["url_mapping"]

@lru_cache(maxsize=1000)
def get_url_mapping(short_code):
    #Look Up the long url corresponding to a short url
    #the result is cached so that subsequent requests for same short code are served quickly
    doc = url_mapping.find_one({"short_code":short_code})
    return (doc["long_url"], doc["expires_at"]) if doc else None

def invalidate_cache():
    get_url_mapping.cache_clear()


# Clean UP SERVICE for expired URLS
scheduler = BackgroundScheduler()

def cleanup_expired_urls():
    now = datetime.now(timezone.utc)
    expired_docs = list(url_mapping.find({"expires_at": {"$lt": now}}))
    for doc in expired_docs:
        short_code = doc["short_code"]
        url_mapping.delete_one({"_id": doc["_id"]})

        recycle_key(short_code)
    
    if expired_docs:
        invalidate_cache()

scheduler.add_job(func=cleanup_expired_urls, trigger="interval", seconds=60)
scheduler.start()
atexit.register(lambda: scheduler.shutdown())

# Get request (READS)
@app.route("/<short_code>")
def redirect_short_url(short_code):
    mapping = get_url_mapping(short_code)
    if not mapping:
        return jsonify({"error": "Short URL not found"}), 404

    long_url, expires_at = mapping
    if expires_at:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
        
    if expires_at and datetime.now(timezone.utc) > expires_at:
        return jsonify({"error": "URL expired"}), 410
    
    return redirect(long_url, code=302)

BASE_URL = "http://localhost:5000/"

# Post Request (Write)
@app.route("/shorten", methods=["POST"])
def shorten_url():
    data = request.get_json()
    long_url = data.get("long_url")

    if not long_url: 
        return jsonify({"error": "No URL provided"}), 400
    
    expires_in_days = data.get("expires_in_days", 365)
    expires_at = datetime.now(timezone.utc) + timedelta(days=expires_in_days)

    short_code = allocate_key()

    doc = {"short_code": short_code, "long_url":long_url, "expires_at": expires_at}
    url_mapping.insert_one(doc)

    invalidate_cache()


    short_url = BASE_URL + short_code
    return jsonify({"short_url": short_url, "long_url": long_url, "expires_at": expires_at.isoformat()}), 201

if __name__ == "__main__":
    app.run(debug=True)