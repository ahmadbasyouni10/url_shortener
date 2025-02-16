// src/components/url-shortener-form.tsx
'use client';

import { useState } from 'react';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { CalendarIcon, CopyIcon, CheckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  longUrl: z.string().url({ message: "Please enter a valid URL" }),
  expiresInDays: z.coerce.number().int().positive().default(365),
});

type ShortenedUrl = {
  short_url: string;
  long_url: string;
  expires_at: string;
};

export function URLShortenerForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [shortenedUrl, setShortenedUrl] = useState<ShortenedUrl | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      longUrl: "",
      expiresInDays: 365,
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:5000/shorten', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          long_url: values.longUrl,
          expires_in_days: values.expiresInDays,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to shorten URL');
      }

      const data = await response.json();
      setShortenedUrl(data);
      form.reset();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to shorten URL. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  const copyToClipboard = () => {
    if (shortenedUrl) {
      navigator.clipboard.writeText(shortenedUrl.short_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copied!",
        description: "URL copied to clipboard",
      });
    }
  };

  const formatExpiryDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Shorten a URL</CardTitle>
          <CardDescription>
            Enter a long URL to create a shorter, more manageable link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="longUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>URL to shorten</FormLabel>
                    <FormControl>
                      <Input placeholder="https://example.com/very/long/url/that/needs/shortening" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="expiresInDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expires in (days)</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Shortening..." : "Shorten URL"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {shortenedUrl && (
        <Card>
          <CardHeader>
            <CardTitle>Your Shortened URL</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between space-x-2">
              <Input
                readOnly
                value={shortenedUrl?.short_url}
                className="flex-1"
              />
              <Button
                size="icon"
                variant="outline"
                onClick={copyToClipboard}
                className="flex-shrink-0"
                title="Copy to clipboard"
              >
                {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
              </Button>
            </div>
            <div className="text-sm text-muted-foreground">
              <p>Original URL: {shortenedUrl?.long_url}</p>
              <p>Expires on: {formatExpiryDate(shortenedUrl?.expires_at)}</p>
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="w-full" onClick={() => setShortenedUrl(null)}>
              Shorten another URL
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}