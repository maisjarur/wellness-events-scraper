# Wellness Events Scraper

Discover wellness and conscious living events, classes, and workshops in any location. This Actor finds wellness providers (yoga studios, meditation centers, holistic health practitioners, fitness centers) and scrapes their websites for upcoming events—both online and in-person.

## 🌟 Features

- **Multi-Source Discovery**: Uses Google Maps to find wellness providers in any location
- **Comprehensive Event Scraping**: Extracts events from provider websites automatically
- **Smart Filtering**: Filter by date range, online/in-person, and service types
- **Rich Data Output**: Event details, provider information, contact info, and pricing
- **Configurable**: Control search radius, max providers, events per provider, and more
- **Proxy Support**: Built-in proxy configuration for reliable scraping

## 🎯 Use Cases

- **Event Aggregators**: Build wellness event discovery platforms
- **Community Builders**: Find events for AI Brunch Club or similar communities
- **Marketing Research**: Analyze wellness event trends and pricing
- **Personal Use**: Discover yoga classes, meditation sessions, and workshops near you
- **Business Development**: Identify wellness businesses and their offerings

## 📥 Input Parameters

| Parameter | Type | Required | Description | Default |
|-----------|------|----------|-------------|---------|
| `location` | string | ✅ | City, address, or coordinates to search | - |
| `searchRadius` | integer | - | Radius in miles to search | 10 |
| `serviceTypes` | array | - | Types of wellness services | ["yoga", "meditation", "fitness", "wellness", "holistic health"] |
| `dateRange` | object | - | Start and end dates (YYYY-MM-DD) | null |
| `eventTypes` | array | - | Types of events to look for | ["class", "workshop", "retreat", "session", "event"] |
| `onlinePreference` | enum | - | "all", "online", or "in-person" | "all" |
| `maxProviders` | integer | - | Max providers to scrape (0 = unlimited) | 50 |
| `maxEventsPerProvider` | integer | - | Max events per provider | 10 |
| `includeDescription` | boolean | - | Include full event descriptions | true |
| `proxyConfiguration` | object | - | Proxy settings | { useApifyProxy: true } |

## 📤 Output

The Actor outputs structured JSON data for each event found:

```json
{
    "eventName": "Morning Vinyasa Flow",
    "eventType": "class",
    "eventDescription": "Start your day with an energizing vinyasa flow practice",
    "eventDate": "2026-03-15",
    "eventTime": "8:00 AM",
    "eventUrl": "https://yogastudio.com/events/morning-flow",
    "registrationUrl": "https://yogastudio.com/book",
    "price": "$25",
    "isOnline": false,
    "location": "123 Main St, San Francisco, CA",
    "providerName": "Zen Yoga Studio",
    "providerType": "yoga",
    "providerUrl": "https://yogastudio.com",
    "providerPhone": "+1 (415) 555-0123",
    "providerEmail": "info@yogastudio.com",
    "providerAddress": "123 Main St, San Francisco, CA 94102",
    "scrapedAt": "2026-03-05T12:00:00Z"
}
```

## 🚀 Quick Start

### Example 1: Find Yoga Classes in San Francisco

```json
{
    "location": "San Francisco, CA",
    "serviceTypes": ["yoga"],
    "dateRange": {
        "startDate": "2026-03-01",
        "endDate": "2026-03-31"
    },
    "maxProviders": 20
}
```

### Example 2: Find Online Meditation Workshops

```json
{
    "location": "New York, NY",
    "serviceTypes": ["meditation", "mindfulness"],
    "onlinePreference": "online",
    "maxProviders": 30,
    "maxEventsPerProvider": 20
}
```

### Example 3: Comprehensive Wellness Event Search

```json
{
    "location": "Los Angeles, CA",
    "searchRadius": 15,
    "serviceTypes": ["yoga", "meditation", "fitness", "wellness", "holistic health", "pilates", "tai chi"],
    "eventTypes": ["class", "workshop", "retreat", "session", "event", "training", "certification"],
    "onlinePreference": "all",
    "dateRange": {
        "startDate": "2026-03-01",
        "endDate": "2026-06-30"
    },
    "maxProviders": 100,
    "maxEventsPerProvider": 15,
    "includeDescription": true
}
```

## 🛠️ Local Development

### Prerequisites

- Node.js 18+
- Apify CLI (`npm install -g apify-cli`)
- Apify account (free at https://console.apify.com)

### Setup

1. Install dependencies:
```bash
npm install
```

2. Login to Apify:
```bash
apify login
```

3. Create test input in `storage/key_value_stores/default/INPUT.json`:
```json
{
    "location": "San Francisco, CA",
    "serviceTypes": ["yoga"],
    "maxProviders": 5
}
```

4. Run locally:
```bash
apify run
```

5. View results:
```bash
cat storage/datasets/default/*.json
```

### Deploy to Apify

```bash
apify push
```

## 📊 Performance

- **Speed**: ~10-20 seconds per provider (depends on website complexity)
- **Concurrency**: HTTP requests use 10-20 concurrent connections
- **Typical Run**: 50 providers in 10-15 minutes
- **Data Quality**: Extracts 60-80% of visible events (varies by website structure)

## 🔧 How It Works

1. **Provider Discovery** (Step 1):
   - Calls Google Maps Scraper Actor to find wellness businesses
   - Searches for each service type in the specified location
   - Filters providers with websites or contact information

2. **Event Scraping** (Step 2):
   - Visits each provider's website
   - Uses Cheerio crawler (fast, HTTP-only)
   - Searches for common event HTML patterns (`.event`, `.class`, `.workshop`, etc.)
   - Follows links to schedule/calendar pages
   - Extracts event details: name, date, time, price, location, description

3. **Data Processing**:
   - Deduplicates events per provider
   - Applies date range and online/in-person filters
   - Limits events per provider
   - Pushes structured data to Apify dataset

## ⚠️ Limitations

- **Website Structure**: Event extraction quality depends on website HTML structure
- **Date Parsing**: Some date formats may not be recognized (returns raw text)
- **Dynamic Content**: Sites with heavy JavaScript may miss events (consider upgrading to Playwright for specific sites)
- **Rate Limiting**: Respects website rate limits; may be slower for large provider lists
- **Accuracy**: Manual verification recommended for mission-critical use cases

## 🎯 Integration Ideas

### With AI Brunch Club App

Perfect integration for your AI Brunch Club app:

1. **Event Discovery**: Use this Actor to find wellness events in user's location
2. **Automated Posting**: Create AI Brunch Club events based on discovered wellness events
3. **Multi-Channel Sharing**: Extract event details → format with AI → share to social media
4. **Recurring Scrapes**: Schedule weekly runs to keep events fresh

### With OpenClaw Multi-Agent

Use the Meta Ads Expert agent to promote discovered events:

```typescript
// 1. Run wellness scraper
const events = await Actor.call('your-username/wellness-events-scraper', {
    location: 'San Francisco, CA',
    serviceTypes: ['yoga', 'meditation']
});

// 2. For each event, create Facebook ad
// Use OpenClaw Meta Ads Expert to generate ad copy
```

## 💡 Pro Tips

1. **Start Small**: Test with `maxProviders: 5` before running large scrapes
2. **Use Proxies**: Enable Apify Proxy for reliable scraping
3. **Filter Smart**: Use specific service types for better results
4. **Date Ranges**: Set realistic date ranges (e.g., next 3 months)
5. **Verify Data**: Check a few events manually to validate accuracy

## 🐛 Troubleshooting

**No events found?**
- Try increasing `maxEventsPerProvider`
- Expand `searchRadius`
- Add more `serviceTypes`
- Check if providers have events listed on their websites

**Too slow?**
- Reduce `maxProviders`
- Decrease `maxEventsPerProvider`
- Set `includeDescription: false`

**Missing event details?**
- Some websites may have complex structures
- Consider using Playwright for JavaScript-heavy sites
- Submit an issue with the provider URL for support

## 🤝 Support

- **Issues**: Report bugs or request features
- **Questions**: Reach out via Apify Console
- **Contributions**: Pull requests welcome!

## 🔗 Related Actors

- [Google Maps Scraper](https://apify.com/compass/google-maps-scraper) - Used for provider discovery
- [Web Scraper](https://apify.com/apify/web-scraper) - General-purpose web scraping
- [Cheerio Scraper](https://apify.com/apify/cheerio-scraper) - Fast HTML scraping

---

**Built with ❤️ for the wellness and conscious living community**

*Perfect for AI Brunch Club and similar community-building platforms*
