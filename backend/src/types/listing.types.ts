import { Listing, Subscription } from '@prisma/client';

export interface ListingWithOptionalData {
  id: string;
  title: string;
  price: string;
  priceValue?: number | null;
  pricePerM2?: number | null;
  district?: string | null;
  rooms?: number | null;
  area?: number | null;
  floor?: string | null;
  category: string;
  link: string;
  pubDate?: Date;
  createdAt?: Date;
}

export type ListingEntity = Listing;
export type SubscriptionEntity = Subscription;
