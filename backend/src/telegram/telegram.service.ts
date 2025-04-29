import {
  Injectable,
  Logger,
  OnModuleInit,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Bot, Context, InlineKeyboard } from 'grammy';
import { PrismaService } from '../config/prisma.service';
import { TELEGRAM_BOT_TOKEN } from '../config/telegram.config';
import { UserService } from '../user/user.service';
import { PollingService } from '../polling/polling.service';
import { RssService } from '../rss/rss.service';
import { FailedListingService } from '../config/failed-listing.service';

interface FilterSetupState {
  step: number;
  district?: string;
  priceMin?: number;
  priceMax?: number;
  roomsMin?: number;
  roomsMax?: number;
}

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  public readonly bot: Bot<Context>;
  private userFilterSetup: Map<string, FilterSetupState> = new Map();
  private districtSearch: Map<
    string,
    {
      selectedDistrict?: string;
      priceMin?: number;
      priceMax?: number;
      roomsMin?: number;
      roomsMax?: number;
      page: number;
      awaitingInput?: string;
    }
  > = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
    @Inject(forwardRef(() => PollingService))
    private readonly pollingService: PollingService,
    private readonly rssService: RssService,
    private readonly failedListingService: FailedListingService,
  ) {
    if (!TELEGRAM_BOT_TOKEN) {
      throw new Error('TELEGRAM_BOT_TOKEN not set');
    }
    this.bot = new Bot<Context>(TELEGRAM_BOT_TOKEN);

    this.bot.command('start', (ctx) => this.handleStart(ctx));
    this.bot.command('addfilter', (ctx) => this.handleAddFilterStart(ctx));
    this.bot.command('myfilters', (ctx) => this.handleMyFilters(ctx));
    this.bot.command('removefilter', (ctx) => this.handleRemoveFilter(ctx));
    this.bot.command('help', (ctx) => this.handleHelp(ctx));
    this.bot.command('latest', (ctx) => this.handleLatest(ctx));
    this.bot.command('districts', (ctx) => this.handleDistricts(ctx));
    this.bot.command('failedlistings', (ctx) => this.handleFailedListings(ctx));

    this.bot.callbackQuery(/district_(.+)/, (ctx) =>
      this.handleDistrictSelection(ctx),
    );

    this.bot.callbackQuery('filter_price_min', (ctx) =>
      this.handlePriceMinFilter(ctx),
    );
    this.bot.callbackQuery('filter_price_max', (ctx) =>
      this.handlePriceMaxFilter(ctx),
    );
    this.bot.callbackQuery('filter_rooms_min', (ctx) =>
      this.handleRoomsMinFilter(ctx),
    );
    this.bot.callbackQuery('filter_rooms_max', (ctx) =>
      this.handleRoomsMaxFilter(ctx),
    );

    this.bot.callbackQuery('search', (ctx) => this.handleSearch(ctx));
    this.bot.callbackQuery(/page_(\d+)/, (ctx) => this.handleDistrictPage(ctx));

    this.bot.on('message:text', (ctx) => this.handleTextMessage(ctx));
  }

  onModuleInit() {
    this.startBot();
  }

  private startBot() {
    this.bot.start().catch((error: unknown) => {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to start bot: ${errorMessage}`);
    });
    this.logger.log('Telegram bot started');
  }

  private async handleStart(ctx: Context) {
    const chatId = String(ctx.chat?.id);

    await this.userService.ensureUser(chatId);

    await ctx.reply(
      '🏠 Welcome to the Real Estate Notification Bot! 🏠\n\n' +
        'I can help you find apartments in Riga based on your preferences.\n\n' +
        'Use these commands:\n' +
        '/addfilter - Create a complete filter with price and room ranges\n' +
        '/myfilters - See your active filters\n' +
        '/removefilter - Delete a filter\n' +
        '/districts - Browse listings by districts with filters\n' +
        '/latest <filter_id> - Get the newest listing matching your filter\n' +
        '/failedlistings - View listings that failed processing (admin only)\n' +
        '/help - Show this help message',
    );
  }

  private async handleHelp(ctx: Context) {
    await ctx.reply(
      '🏠 Real Estate Notification Bot Help 🏠\n\n' +
        'Commands:\n' +
        '/addfilter - Create a complete filter for flats with district, price range, and room range\n' +
        '/myfilters - Show all your active filters\n' +
        '/removefilter <id> - Delete a filter by ID\n' +
        '/latest <filter_id> - Get the newest listing matching your filter\n' +
        '/districts - Browse listings by districts with interactive filters\n' +
        '/failedlistings - View listings that failed processing (admin only)\n' +
        '/help - Show this help message\n\n' +
        'Each filter you create can include:\n' +
        '• District - Specific area in Riga or any district\n' +
        '• Price range - Minimum and maximum price\n' +
        '• Rooms range - Minimum and maximum number of rooms\n\n' +
        'I will notify you about new listings that match your filters as they appear.',
    );
  }

  private async handleAddFilterStart(ctx: Context) {
    const chatId = String(ctx.chat?.id);
    await this.userService.ensureUser(chatId);

    this.userFilterSetup.set(chatId, { step: 1 });
    await ctx.reply(
      '📝 Adding a new filter for flats.\n\nPlease enter the district (e.g. center), or type "any" for all districts:',
    );
  }

  /**
   * Override the main text message handler to handle filter inputs
   */
  private async handleTextMessage(ctx: Context) {
    const chatId = String(ctx.chat?.id);
    const state = this.userFilterSetup.get(chatId);
    const searchState = this.districtSearch.get(chatId);

    if (searchState && searchState.awaitingInput) {
      const text = ctx.message?.text?.trim() || '';
      const filterType = searchState.awaitingInput;

      const value = parseInt(text, 10);

      if (isNaN(value) || value < 0) {
        await ctx.reply('Please enter a valid positive number.');
        return;
      }

      switch (filterType) {
        case 'priceMin':
          searchState.priceMin = value;
          break;
        case 'priceMax':
          searchState.priceMax = value;
          break;
        case 'roomsMin':
          searchState.roomsMin = value;
          break;
        case 'roomsMax':
          searchState.roomsMax = value;
          break;
      }

      delete searchState.awaitingInput;
      this.districtSearch.set(chatId, searchState);

      await ctx.reply(`Filter updated: ${filterType} = ${value}`);
      await this.sendDistrictSelection(ctx);
      return;
    }

    if (!state) {
      return;
    }

    const text = ctx.message?.text?.trim() || '';

    try {
      switch (state.step) {
        case 1:
          state.district =
            text.toLowerCase() === 'any' ? undefined : text.toLowerCase();
          state.step = 2;
          await ctx.reply(
            '💰 Enter the minimum price in € (e.g. 50000), or 0 for no minimum:',
          );
          break;
        case 2:
          {
            const priceMin = parseInt(text, 10);
            state.priceMin = priceMin > 0 ? priceMin : undefined;
            state.step = 3;
            await ctx.reply(
              '💰 Enter the maximum price in € (e.g. 150000), or 0 for no maximum:',
            );
          }
          break;
        case 3:
          {
            const priceMax = parseInt(text, 10);
            state.priceMax = priceMax > 0 ? priceMax : undefined;
            state.step = 4;
            await ctx.reply(
              '🚪 Enter the minimum number of rooms (e.g. 1), or 0 for no minimum:',
            );
          }
          break;
        case 4:
          {
            const roomsMin = parseFloat(text);
            state.roomsMin = roomsMin > 0 ? roomsMin : undefined;
            state.step = 5;
            await ctx.reply(
              '🚪 Enter the maximum number of rooms (e.g. 3), or 0 for no maximum:',
            );
          }
          break;
        case 5:
          {
            const roomsMax = parseFloat(text);
            state.roomsMax = roomsMax > 0 ? roomsMax : undefined;

            const subscription = await this.userService.createSubscription(
              chatId,
              {
                category: 'flats',
                district: state.district,
                priceMin: state.priceMin,
                priceMax: state.priceMax,
                roomsMin: state.roomsMin,
                roomsMax: state.roomsMax,
              },
            );

            this.userFilterSetup.delete(chatId);

            let filterSummary = '✅ Filter saved successfully!\n\n';
            filterSummary += `Category: flats\n`;
            filterSummary += `District: ${subscription.district || 'any'}\n`;
            filterSummary += `Price: ${subscription.priceMin ? subscription.priceMin + ' €' : '0 €'} - ${subscription.priceMax ? subscription.priceMax + ' €' : 'no limit'}\n`;
            filterSummary += `Rooms: ${subscription.roomsMin || '0'} - ${subscription.roomsMax || 'no limit'}\n\n`;
            filterSummary +=
              'You will receive notifications when new listings match these criteria.';

            await ctx.reply(filterSummary);
          }
          break;
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error while adding filter: ${errorMessage}`);
      await ctx.reply(
        '❌ Something went wrong adding the filter. Please try /addfilter again.',
      );
      this.userFilterSetup.delete(chatId);
    }
  }

  private async handleMyFilters(ctx: Context) {
    const chatId = String(ctx.chat?.id);
    await this.userService.ensureUser(chatId);

    const filters = await this.userService.getSubscriptions(chatId);
    if (filters.length === 0) {
      await ctx.reply(
        'You have no active filters. Use /addfilter to create one.',
      );
      return;
    }

    let message = '📋 Your active filters:\n\n';
    filters.forEach((f, index) => {
      message +=
        `${index + 1}) ID: ${f.id}\n` +
        `   Category: ${f.category}\n` +
        `   District: ${f.district || 'any'}\n` +
        `   Price: ${f.priceMin ? f.priceMin + ' €' : '0 €'} - ${f.priceMax ? f.priceMax + ' €' : 'no limit'}\n` +
        `   Rooms: ${f.roomsMin || '0'} - ${f.roomsMax || 'no limit'}\n\n`;
    });

    message += 'To remove a filter, use /removefilter <id>';

    await ctx.reply(message);
  }

  private async handleRemoveFilter(ctx: Context) {
    const chatId = String(ctx.chat?.id);
    await this.userService.ensureUser(chatId);

    const text = ctx.message?.text || '';
    const parts = text.split(' ');
    if (parts.length < 2) {
      await ctx.reply(
        'Please specify the filter ID to remove, e.g.: /removefilter <id>\n' +
          'Use /myfilters to see your filter IDs.',
      );
      return;
    }
    const filterId = parts[1];

    try {
      await this.userService.removeSubscription(chatId, filterId);
      await ctx.reply(`✅ Removed filter with ID ${filterId}.`);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to remove filter: ${errorMessage}`);
      await ctx.reply('❌ Could not remove filter. Check the ID or try again.');
    }
  }

  private async handleLatest(ctx: Context) {
    const chatId = String(ctx.chat?.id);
    await this.userService.ensureUser(chatId);

    const text = ctx.message?.text || '';
    const parts = text.split(' ');

    if (parts.length < 2) {
      await ctx.reply(
        'Please specify the filter ID to use, e.g.: /latest <filter_id>\n' +
          'Use /myfilters to see your filter IDs.',
      );
      return;
    }

    const filterId = parts[1];

    try {
      const subscription = await this.prisma.subscription.findFirst({
        where: {
          id: filterId,
          userChatId: chatId,
        },
      });

      if (!subscription) {
        await ctx.reply(
          `❌ Filter with ID ${filterId} not found or doesn't belong to you.`,
        );
        return;
      }

      await ctx.reply(
        '🔍 Searching for the latest listing matching your filter...',
      );

      const latestListing = await this.pollingService.getLastAvailableListing({
        category: subscription.category,
        district: subscription.district || undefined,
        priceMin: subscription.priceMin || undefined,
        priceMax: subscription.priceMax || undefined,
        roomsMin: subscription.roomsMin || undefined,
        roomsMax: subscription.roomsMax || undefined,
        areaMin: subscription.areaMin || undefined,
        areaMax: subscription.areaMax || undefined,
      });

      if (!latestListing) {
        await ctx.reply('😔 No listings found matching your filter criteria.');
        return;
      }

      const messageText =
        this.pollingService.buildListingMessage(latestListing);
      await ctx.reply(messageText);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error while fetching latest listing: ${errorMessage}`);
      await ctx.reply(
        '❌ Something went wrong while fetching the latest listing. Please try again later.',
      );
    }
  }

  /**
   * Handle the /districts command to display district selection
   */
  private async handleDistricts(ctx: Context) {
    const chatId = String(ctx.chat?.id);
    await this.userService.ensureUser(chatId);

    this.districtSearch.set(chatId, { page: 0 });

    await this.sendDistrictSelection(ctx);
  }

  /**
   * Display district selection with paginated pills
   */
  private async sendDistrictSelection(ctx: Context) {
    const chatId = String(ctx.chat?.id);
    const searchState = this.districtSearch.get(chatId);

    if (!searchState) {
      await ctx.reply('Please start again with /districts');
      return;
    }

    const allDistricts = this.rssService.AVAILABLE_DISTRICTS.filter(
      (d) => d.value !== 'all',
    );

    const districtsPerPage = 8;
    const totalPages = Math.ceil(allDistricts.length / districtsPerPage);
    const startIdx = searchState.page * districtsPerPage;
    const endIdx = Math.min(startIdx + districtsPerPage, allDistricts.length);
    const currentPageDistricts = allDistricts.slice(startIdx, endIdx);

    const keyboard = new InlineKeyboard();

    for (let i = 0; i < currentPageDistricts.length; i += 2) {
      const district1 = currentPageDistricts[i];
      const district2 =
        i + 1 < currentPageDistricts.length
          ? currentPageDistricts[i + 1]
          : null;

      if (district2) {
        keyboard
          .row()
          .text(district1.label, `district_${district1.value}`)
          .text(district2.label, `district_${district2.value}`);
      } else {
        keyboard.row().text(district1.label, `district_${district1.value}`);
      }
    }

    keyboard.row();
    if (searchState.page > 0) {
      keyboard.text('⬅️ Previous', `page_${searchState.page - 1}`);
    }

    if (searchState.page < totalPages - 1) {
      keyboard.text('Next ➡️', `page_${searchState.page + 1}`);
    }

    let filterInfo = '🏠 Select a district to browse listings:';
    if (searchState.selectedDistrict) {
      const districtName =
        allDistricts.find((d) => d.value === searchState.selectedDistrict)
          ?.label || searchState.selectedDistrict;
      filterInfo += `\n\nSelected district: ${districtName}`;

      if (searchState.priceMin || searchState.priceMax) {
        filterInfo += `\nPrice: ${searchState.priceMin || '0'} - ${searchState.priceMax ? searchState.priceMax + ' €' : 'max €'}`;
      }

      if (searchState.roomsMin || searchState.roomsMax) {
        filterInfo += `\nRooms: ${searchState.roomsMin || '0'} - ${searchState.roomsMax || 'max'}`;
      }

      keyboard
        .row()
        .text('🔍 Price Min', 'filter_price_min')
        .text('🔍 Price Max', 'filter_price_max');

      keyboard
        .row()
        .text('🚪 Rooms Min', 'filter_rooms_min')
        .text('🚪 Rooms Max', 'filter_rooms_max');

      keyboard.row().text('🔎 Search', 'search');
    }

    await ctx.reply(filterInfo, { reply_markup: keyboard });
  }

  /**
   * Handle district selection
   */
  private async handleDistrictSelection(ctx: Context) {
    if (!ctx.callbackQuery?.data) return;

    const chatId = String(ctx.chat?.id);
    const district = ctx.callbackQuery.data.replace('district_', '');

    const searchState = this.districtSearch.get(chatId) || { page: 0 };
    searchState.selectedDistrict = district;
    this.districtSearch.set(chatId, searchState);

    await ctx.answerCallbackQuery({ text: `Selected district: ${district}` });
    await this.sendDistrictSelection(ctx);
  }

  /**
   * Handle district pagination
   */
  private async handleDistrictPage(ctx: Context) {
    if (!ctx.callbackQuery?.data) return;

    const chatId = String(ctx.chat?.id);
    const pageMatch = ctx.callbackQuery.data.match(/page_(\d+)/);

    if (pageMatch && pageMatch[1]) {
      const page = parseInt(pageMatch[1], 10);
      const searchState = this.districtSearch.get(chatId) || { page: 0 };
      searchState.page = page;
      this.districtSearch.set(chatId, searchState);

      await ctx.answerCallbackQuery();
      await this.sendDistrictSelection(ctx);
    }
  }

  /**
   * Handle price min filter
   */
  private async handlePriceMinFilter(ctx: Context) {
    if (!ctx.callbackQuery?.data) return;

    const chatId = String(ctx.chat?.id);
    await ctx.answerCallbackQuery();

    await ctx.reply('Please enter the minimum price in euros (e.g., 50000):');

    const currentState = this.districtSearch.get(chatId);
    if (currentState) {
      currentState.awaitingInput = 'priceMin';
      this.districtSearch.set(chatId, currentState);
    }
  }

  /**
   * Handle price max filter
   */
  private async handlePriceMaxFilter(ctx: Context) {
    if (!ctx.callbackQuery?.data) return;

    const chatId = String(ctx.chat?.id);
    await ctx.answerCallbackQuery();

    await ctx.reply('Please enter the maximum price in euros (e.g., 150000):');

    const currentState = this.districtSearch.get(chatId);
    if (currentState) {
      currentState.awaitingInput = 'priceMax';
      this.districtSearch.set(chatId, currentState);
    }
  }

  /**
   * Handle rooms min filter
   */
  private async handleRoomsMinFilter(ctx: Context) {
    if (!ctx.callbackQuery?.data) return;

    const chatId = String(ctx.chat?.id);
    await ctx.answerCallbackQuery();

    await ctx.reply('Please enter the minimum number of rooms (e.g., 1):');

    const currentState = this.districtSearch.get(chatId);
    if (currentState) {
      currentState.awaitingInput = 'roomsMin';
      this.districtSearch.set(chatId, currentState);
    }
  }

  /**
   * Handle rooms max filter
   */
  private async handleRoomsMaxFilter(ctx: Context) {
    if (!ctx.callbackQuery?.data) return;

    const chatId = String(ctx.chat?.id);
    await ctx.answerCallbackQuery();

    await ctx.reply('Please enter the maximum number of rooms (e.g., 3):');

    const currentState = this.districtSearch.get(chatId);
    if (currentState) {
      currentState.awaitingInput = 'roomsMax';
      this.districtSearch.set(chatId, currentState);
    }
  }

  /**
   * Handle search button to fetch listings
   */
  private async handleSearch(ctx: Context) {
    if (!ctx.callbackQuery?.data) return;

    const chatId = String(ctx.chat?.id);
    const searchState = this.districtSearch.get(chatId);

    if (!searchState || !searchState.selectedDistrict) {
      await ctx.answerCallbackQuery({ text: 'Please select a district first' });
      return;
    }

    await ctx.answerCallbackQuery({ text: 'Searching...' });
    await ctx.reply('🔍 Searching for listings... This may take a moment.');

    try {
      const items = await this.rssService.fetchRssItemsByDistrict(
        searchState.selectedDistrict,
        searchState.priceMin,
        searchState.priceMax,
        searchState.roomsMin,
        searchState.roomsMax,
      );

      if (items.length === 0) {
        await ctx.reply('No listings found matching your criteria.');
        return;
      }

      await this.rssService.storeListings(items);

      const where: {
        district?: string;
        priceValue?: {
          gte?: number;
          lte?: number;
        };
        rooms?: {
          gte?: number;
          lte?: number;
        };
      } = {};

      if (searchState.selectedDistrict !== 'all') {
        where.district = this.rssService.AVAILABLE_DISTRICTS.find(
          (d) => d.value === searchState.selectedDistrict,
        )?.label;
      }

      if (searchState.priceMin || searchState.priceMax) {
        where.priceValue = {};
        if (searchState.priceMin) where.priceValue.gte = searchState.priceMin;
        if (searchState.priceMax) where.priceValue.lte = searchState.priceMax;
      }

      if (searchState.roomsMin || searchState.roomsMax) {
        where.rooms = {};
        if (searchState.roomsMin) where.rooms.gte = searchState.roomsMin;
        if (searchState.roomsMax) where.rooms.lte = searchState.roomsMax;
      }

      const latestListing = await this.prisma.listing.findFirst({
        where,
        orderBy: { pubDate: 'desc' },
      });

      if (!latestListing) {
        await ctx.reply(
          'No listings found in the database matching your criteria.',
        );
        return;
      }

      const messageText =
        this.pollingService.buildListingMessage(latestListing);
      await ctx.reply(messageText);

      const totalListings = await this.prisma.listing.count({ where });

      if (totalListings > 1) {
        await ctx.reply(
          `There are ${totalListings} total listings matching your criteria. Use /latest to see more.`,
        );
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error searching listings: ${errorMessage}`);
      await ctx.reply(
        'An error occurred while searching. Please try again later.',
      );
    }
  }

  /**
   * Handle the /failedlistings command
   * This command retrieves the most recent failed listings
   */
  private async handleFailedListings(ctx: Context) {
    const chatId = String(ctx.chat?.id);

    const user = await this.prisma.user.findUnique({
      where: { chatId },
    });

    if (!user) {
      await ctx.reply('You need to start the bot first with /start command.');
      return;
    }

    try {
      const failedListings = await this.failedListingService.getFailedListings({
        resolved: false,
        limit: 20,
      });

      if (failedListings.length === 0) {
        await ctx.reply('No failed listings found.');
        return;
      }

      const stats = await this.failedListingService.getFailedListingStats();

      let message = `📊 Failed Listings Report\n\n`;
      message += `Total failed listings: ${stats.total}\n`;
      message += `Unresolved: ${stats.unresolved}\n`;
      message += `Last 24 hours: ${stats.last24Hours}\n\n`;
      message += `Showing ${failedListings.length} most recent unresolved listings:\n\n`;

      const byType: Record<string, typeof failedListings> = {};

      failedListings.forEach((listing) => {
        if (!byType[listing.failureType]) {
          byType[listing.failureType] = [];
        }
        byType[listing.failureType].push(listing);
      });

      for (const [type, listings] of Object.entries(byType)) {
        if (listings.length === 0) continue;

        message += `--- ${type} (${listings.length}) ---\n\n`;

        listings.forEach((listing, index) => {
          const title = listing.title || 'Unknown';
          const error = listing.error || 'Unknown error';
          const date = new Date(listing.createdAt).toLocaleString();

          message += `${index + 1}. "${title}"\n`;
          message += `   Error: ${error}\n`;
          message += `   Time: ${date}\n`;
          if (listing.link) {
            message += `   Link: ${listing.link}\n`;
          }
          message += '\n';
        });
      }

      await ctx.reply(message);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error fetching failed listings: ${errorMessage}`);
      await ctx.reply('An error occurred while fetching failed listings.');
    }
  }
}
