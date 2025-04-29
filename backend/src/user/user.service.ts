import { Injectable } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';

interface SubscriptionDto {
  category: string;
  district?: string;
  priceMin?: number;
  priceMax?: number;
  roomsMin?: number;
  roomsMax?: number;
  areaMin?: number;
  areaMax?: number;
}

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureUser(chatId: string) {
    const user = await this.prisma.user.findUnique({ where: { chatId } });
    if (!user) {
      await this.prisma.user.create({
        data: {
          chatId,
        },
      });
    }
  }

  async createSubscription(chatId: string, dto: Partial<SubscriptionDto>) {
    return this.prisma.subscription.create({
      data: {
        userChatId: chatId,
        category: dto.category || 'flats',
        district: dto.district,
        priceMax: dto.priceMax,
        priceMin: dto.priceMin,
        roomsMin: dto.roomsMin,
        roomsMax: dto.roomsMax,
        areaMin: dto.areaMin,
        areaMax: dto.areaMax,
      },
    });
  }

  async getSubscriptions(chatId: string) {
    return this.prisma.subscription.findMany({
      where: { userChatId: chatId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async removeSubscription(chatId: string, subscriptionId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: {
        id: subscriptionId,
        userChatId: chatId,
      },
    });
    if (!sub) {
      throw new Error('Subscription not found or does not belong to the user');
    }

    await this.prisma.subscription.delete({ where: { id: subscriptionId } });
  }
}
