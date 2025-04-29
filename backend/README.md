# Real Estate Telegram Bot

This NestJS application fetches real estate listings from SS.lv RSS feeds, stores them in a PostgreSQL database, and sends matching listings to Telegram users based on their subscription filters.

## Features

- Fetches and parses RSS feeds from SS.lv real estate listings
- Stores listings in PostgreSQL with Prisma ORM
- Telegram bot with filter subscription management
- User filters by district, price, rooms, and more
- Deduplication system to prevent repeated notifications
- Docker setup for easy deployment

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL database
- Telegram Bot Token (get one from @BotFather)

## Environment Variables

Create a `.env` file with the following variables:

```
# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_DB=realestate-db

# Connection string
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}?schema=public

# Telegram Bot Token
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# Optional
PORT=3000
RSS_FEED_URL=https://www.ss.lv/rss/lv/real-estate/flats/riga/
```

## Installation

### Local Development

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Run Prisma migrations:

```bash
npx prisma migrate dev
```

4. Generate Prisma client (if needed):

```bash
npx prisma generate
```

5. Start the application:

```bash
npm run start:dev
```

### Docker Deployment

1. Build and start the containers:

```bash
docker-compose up -d
```

2. Run migrations in the container:

```bash
docker-compose exec app npx prisma migrate deploy
```

## Troubleshooting

If you encounter issues with missing database fields, run the following commands:

```bash
# Pull the current schema from the database
npx prisma db pull

# Generate the client based on the updated schema
npx prisma generate

# Apply any pending migrations
npx prisma migrate dev
```

## Usage

1. Start a chat with your bot on Telegram
2. Use the following commands:

- `/start` - Welcome message and available commands
- `/addfilter` - Add a new subscription filter
- `/myfilters` - View your active filters
- `/removefilter <id>` - Remove a filter by ID
- `/help` - Display help information

## Project Structure

```
backend/
├── prisma/
│   └── schema.prisma     # Database schema
├── src/
│   ├── config/           # Configuration files
│   ├── health/           # Health check endpoint
│   ├── polling/          # Listing polling and notification
│   ├── rss/              # RSS feed fetching and parsing
│   ├── telegram/         # Telegram bot service
│   ├── user/             # User management service
│   ├── app.module.ts     # Main application module
│   └── main.ts           # Application entry point
├── .env                  # Environment variables
├── docker-compose.yml    # Docker Compose configuration
└── Dockerfile            # Docker build instructions
```

## Development

### Adding New Features

1. Create feature branch
2. Implement changes
3. Update tests
4. Submit pull request

### Running Tests

```bash
npm test
```

## License

MIT
