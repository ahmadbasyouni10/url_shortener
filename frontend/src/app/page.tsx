// src/app/page.tsx
import { URLShortenerForm } from '@/components/ui/url-shortener-form';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center p-4 md:p-24">
      <div className="max-w-3xl w-full">
        <h1 className="text-4xl font-bold text-center mb-6">URL Shortener</h1>
        <p className="text-center text-muted-foreground mb-12">
          Create shortened URLs that are easy to share and remember.
        </p>
        
        <URLShortenerForm />
      </div>
    </main>
  );
}