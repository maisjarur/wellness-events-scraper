// Apify SDK - toolkit for building Apify Actors
import { Actor, log } from 'apify';
// Crawlee - web scraping and browser automation library
import { CheerioCrawler } from '@crawlee/cheerio';
// Date utilities
import { parseISO, isWithinInterval, isValid } from 'date-fns';

// TypeScript interfaces for type safety
interface Input {
    location: string;
    searchRadius?: number;
    serviceTypes?: string[];
    dateRange?: {
        startDate?: string;
        endDate?: string;
    };
    eventTypes?: string[];
    onlinePreference?: 'all' | 'online' | 'in-person';
    maxProviders?: number;
    maxEventsPerProvider?: number;
    includeDescription?: boolean;
    budgetRange?: {
        min?: number | 0;
        max?: number | null;
    };
    includeOnlineProviders?: boolean;
    includeInstagram?: boolean;
    instagramHashtags?: string[];
    instagramAccounts?: string[];
    includeTikTok?: boolean;
    tiktokHashtags?: string[];
    tiktokAccounts?: string[];
    proxyConfiguration?: Record<string, unknown>;
}

interface WellnessProvider {
    name: string;
    address: string;
    phone?: string;
    website?: string;
    email?: string;
    type: string;
    placeId?: string;
    latitude?: number;
    longitude?: number;
    source: 'google-maps' | 'instagram' | 'tiktok' | 'online-search';
}

interface WellnessEvent {
    eventName: string;
    eventType: string;
    eventDescription?: string;
    eventDate: string;
    eventTime?: string;
    eventUrl: string;
    registrationUrl?: string;
    price?: string;
    priceNumeric?: number | null;
    isOnline: boolean;
    location?: string;
    providerName: string;
    providerType: string;
    providerUrl?: string;
    providerPhone?: string;
    providerEmail?: string;
    providerAddress?: string;
    source: 'website' | 'instagram' | 'tiktok';
    socialHandle?: string;
    scrapedAt: string;
}

// Helper function to extract numeric price from text
function extractPrice(priceText: string): number | null {
    const match = priceText.match(/\$?(\d+(?:\.\d{2})?)/);
    if (match) {
        return parseFloat(match[1]);
    }
    if (priceText.toLowerCase().includes('free')) {
        return 0;
    }
    return null;
}

// Helper function to check if price is within budget
function isWithinBudget(price: number | null, budgetMin: number, budgetMax: number | null): boolean {
    if (price === null) return true; // Unknown price, don't filter
    if (price < budgetMin) return false;
    if (budgetMax !== null && price > budgetMax) return false;
    return true;
}

// Initialize the Actor
await Actor.init();

try {
    // Get input from Actor's key-value store
    const input = await Actor.getInput<Input>();

    if (!input) {
        throw new Error('No input provided');
    }

    log.info('Actor input:', input);

    // Validate required fields
    if (!input.location) {
        throw new Error('Location is required');
    }

    // Set defaults
    const searchRadius = input.searchRadius || 10;
    const serviceTypes = input.serviceTypes || ['yoga', 'meditation', 'fitness', 'wellness', 'holistic health'];
    const eventTypes = input.eventTypes || ['class', 'workshop', 'retreat', 'session', 'event'];
    const onlinePreference = input.onlinePreference || 'all';
    const maxProviders = input.maxProviders || 50;
    const maxEventsPerProvider = input.maxEventsPerProvider || 10;
    const includeDescription = input.includeDescription !== false;
    const budgetMin = input.budgetRange?.min ?? 0;
    const budgetMax = input.budgetRange?.max ?? null;
    const includeOnlineProviders = input.includeOnlineProviders !== false;
    const includeInstagram = input.includeInstagram || false;
    const includeTikTok = input.includeTikTok || false;

    // Parse date range for filtering
    let dateFilter: { start: Date; end: Date } | null = null;
    if (input.dateRange?.startDate && input.dateRange?.endDate) {
        const startDate = parseISO(input.dateRange.startDate);
        const endDate = parseISO(input.dateRange.endDate);
        if (isValid(startDate) && isValid(endDate)) {
            dateFilter = { start: startDate, end: endDate };
            log.info(`Filtering events from ${startDate} to ${endDate}`);
        } else {
            log.warning(`Invalid date range provided: startDate="${input.dateRange.startDate}" (valid: ${isValid(startDate)}), endDate="${input.dateRange.endDate}" (valid: ${isValid(endDate)}). Date filter will be skipped.`);
        }
    }

    log.info(`Budget range: $${budgetMin} - ${budgetMax === null ? 'unlimited' : `$${budgetMax}`}`);

    // ========================================
    // STEP 1: Find providers via Google Maps
    // ========================================
    log.info('🔍 Step 1: Finding wellness providers via Google Maps...');

    const providers: WellnessProvider[] = [];

    for (const serviceType of serviceTypes) {
        log.info(`Searching for ${serviceType} providers in ${input.location}...`);

        try {
            // Call the Google Maps Scraper actor
            log.debug(`Calling compass/google-maps-scraper for "${serviceType} ${input.location}" (max: ${Math.ceil(maxProviders / serviceTypes.length)} places)`);
            const googleMapsRun = await Actor.call('compass/google-maps-scraper', {
                searchStringsArray: [`${serviceType} ${input.location}`],
                maxCrawledPlacesPerSearch: Math.ceil(maxProviders / serviceTypes.length),
                language: 'en',
                deeperCityScrape: false,
                scrapeReviewsContent: false,
            });

            log.debug(`Google Maps scraper run finished: runId=${googleMapsRun.id}, status=${googleMapsRun.status}, datasetId=${googleMapsRun.defaultDatasetId}`);

            // Get results from the scraper
            const { items } = await Actor.apifyClient
                .dataset(googleMapsRun.defaultDatasetId)
                .listItems();

            log.info(`Found ${items.length} ${serviceType} providers on Google Maps`);

            // Transform Google Maps results to our provider format
            let skippedNoContact = 0;
            for (const place of items) {
                if (place.website || place.phone) { // Only include providers with contact info
                    providers.push({
                        name: place.title || place.name || 'Unknown Provider',
                        address: place.address || place.location?.address || '',
                        phone: place.phone || place.phoneNumber,
                        website: place.website || place.url,
                        email: place.email,
                        type: serviceType,
                        placeId: place.placeId,
                        latitude: place.location?.lat,
                        longitude: place.location?.lng,
                        source: 'google-maps',
                    });
                } else {
                    skippedNoContact++;
                }
            }
            if (skippedNoContact > 0) {
                log.debug(`Skipped ${skippedNoContact} ${serviceType} providers with no website or phone`);
            }
        } catch (error) {
            log.exception(error as Error, `Failed to scrape ${serviceType} providers from Google Maps`);
        }
    }

    log.info(`✅ Found ${providers.length} providers from Google Maps`);

    // ========================================
    // STEP 2: Find online-only providers
    // ========================================
    if (includeOnlineProviders) {
        log.info('🌐 Step 2: Finding online-only wellness providers...');

        for (const serviceType of serviceTypes) {
            try {
                // Search for online-only providers
                log.debug(`Calling compass/google-maps-scraper for online "${serviceType}" providers`);
                const onlineSearch = await Actor.call('compass/google-maps-scraper', {
                    searchStringsArray: [`online ${serviceType} classes`, `virtual ${serviceType} sessions`],
                    maxCrawledPlacesPerSearch: 10,
                    language: 'en',
                    deeperCityScrape: false,
                    scrapeReviewsContent: false,
                });

                log.debug(`Online search run finished: runId=${onlineSearch.id}, status=${onlineSearch.status}, datasetId=${onlineSearch.defaultDatasetId}`);

                const { items } = await Actor.apifyClient
                    .dataset(onlineSearch.defaultDatasetId)
                    .listItems();

                log.info(`Found ${items.length} online ${serviceType} providers`);

                let skippedNoWebsite = 0;
                for (const place of items) {
                    if (place.website) {
                        providers.push({
                            name: place.title || place.name || 'Unknown Provider',
                            address: 'Online',
                            phone: place.phone || place.phoneNumber,
                            website: place.website || place.url,
                            email: place.email,
                            type: serviceType,
                            source: 'online-search',
                        });
                    } else {
                        skippedNoWebsite++;
                    }
                }
                if (skippedNoWebsite > 0) {
                    log.debug(`Skipped ${skippedNoWebsite} online ${serviceType} providers with no website`);
                }
            } catch (error) {
                log.exception(error as Error, `Failed to find online ${serviceType} providers`);
            }
        }

        log.info(`✅ Total providers including online: ${providers.length}`);
    }

    // ========================================
    // STEP 3: Scrape Instagram for events
    // ========================================
    if (includeInstagram) {
        log.info('📸 Step 3: Scraping Instagram for wellness events...');

        const instagramHashtags = input.instagramHashtags || ['yogaclass', 'meditationworkshop', 'wellnessretreat'];
        const instagramAccounts = input.instagramAccounts || [];

        // Scrape Instagram hashtags
        for (const hashtag of instagramHashtags) {
            try {
                log.info(`Searching Instagram hashtag #${hashtag}...`);

                const instagramRun = await Actor.call('apify/instagram-hashtag-scraper', {
                    hashtags: [hashtag],
                    resultsLimit: 50,
                });

                log.debug(`Instagram hashtag run finished: runId=${instagramRun.id}, status=${instagramRun.status}, datasetId=${instagramRun.defaultDatasetId}`);

                const { items } = await Actor.apifyClient
                    .dataset(instagramRun.defaultDatasetId)
                    .listItems();

                log.info(`Found ${items.length} Instagram posts for #${hashtag}`);

                // Parse Instagram posts for event information
                let igSkippedNotEvent = 0;
                let igSkippedBudget = 0;
                for (const post of items) {
                    const caption = post.caption || '';
                    const isEvent = eventTypes.some(type =>
                        caption.toLowerCase().includes(type.toLowerCase())
                    );

                    if (!isEvent) {
                        igSkippedNotEvent++;
                        continue;
                    }

                    if (isEvent) {
                        // Extract event details from caption
                        const eventName = caption.split('\n')[0].slice(0, 100) || `Instagram Event from @${post.ownerUsername}`;
                        const priceMatch = caption.match(/\$(\d+)/);
                        const price = priceMatch ? `$${priceMatch[1]}` : 'See post for details';
                        const priceNumeric = priceMatch ? parseInt(priceMatch[1]) : null;

                        // Check budget filter
                        if (!isWithinBudget(priceNumeric, budgetMin, budgetMax)) {
                            log.debug(`Skipping Instagram post by @${post.ownerUsername} - price ${price} outside budget $${budgetMin}-${budgetMax ?? 'unlimited'}`);
                            igSkippedBudget++;
                            continue;
                        }

                        const event: WellnessEvent = {
                            eventName,
                            eventType: 'Instagram Event',
                            eventDescription: caption.slice(0, 500),
                            eventDate: post.timestamp || new Date().toISOString(),
                            eventUrl: post.url || `https://instagram.com/p/${post.shortCode}`,
                            registrationUrl: post.url,
                            price,
                            priceNumeric,
                            isOnline: caption.toLowerCase().includes('online') || caption.toLowerCase().includes('virtual'),
                            location: caption.includes('online') ? 'Online' : input.location,
                            providerName: `@${post.ownerUsername}`,
                            providerType: 'Instagram',
                            providerUrl: `https://instagram.com/${post.ownerUsername}`,
                            source: 'instagram',
                            socialHandle: post.ownerUsername,
                            scrapedAt: new Date().toISOString(),
                        };

                        await Actor.pushData(event);
                    }
                }
                log.debug(`#${hashtag}: ${igSkippedNotEvent} posts skipped (not event-related), ${igSkippedBudget} skipped (budget)`);
            } catch (error) {
                log.exception(error as Error, `Failed to scrape Instagram hashtag #${hashtag}`);
            }
        }

        // Scrape specific Instagram accounts
        for (const account of instagramAccounts) {
            try {
                log.info(`Scraping Instagram account @${account}...`);

                const accountRun = await Actor.call('apify/instagram-profile-scraper', {
                    usernames: [account],
                    resultsLimit: 20,
                });

                log.debug(`Instagram profile run finished: runId=${accountRun.id}, status=${accountRun.status}, datasetId=${accountRun.defaultDatasetId}`);

                const { items } = await Actor.apifyClient
                    .dataset(accountRun.defaultDatasetId)
                    .listItems();

                log.info(`Found ${items.length} posts from @${account}`);

                let igAccSkippedNotEvent = 0;
                let igAccSkippedBudget = 0;
                for (const post of items) {
                    const caption = (post.caption as string) || '';
                    const isEvent = eventTypes.some(type =>
                        caption.toLowerCase().includes(type.toLowerCase())
                    );

                    if (!isEvent) {
                        igAccSkippedNotEvent++;
                        continue;
                    }

                    const eventName = caption.split('\n')[0].slice(0, 100) || `Event from @${account}`;
                    const priceMatch = caption.match(/\$(\d+)/);
                    const price = priceMatch ? `$${priceMatch[1]}` : 'See post for details';
                    const priceNumeric = priceMatch ? parseInt(priceMatch[1]) : null;

                    if (!isWithinBudget(priceNumeric, budgetMin, budgetMax)) {
                        log.debug(`Skipping @${account} post - price ${price} outside budget $${budgetMin}-${budgetMax ?? 'unlimited'}`);
                        igAccSkippedBudget++;
                        continue;
                    }

                    const event: WellnessEvent = {
                        eventName,
                        eventType: 'Instagram Event',
                        eventDescription: caption.slice(0, 500),
                        eventDate: post.timestamp || new Date().toISOString(),
                        eventUrl: post.url || `https://instagram.com/${account}`,
                        registrationUrl: post.url,
                        price,
                        priceNumeric,
                        isOnline: caption.toLowerCase().includes('online'),
                        location: 'See Instagram post',
                        providerName: `@${account}`,
                        providerType: 'Instagram',
                        providerUrl: `https://instagram.com/${account}`,
                        source: 'instagram',
                        socialHandle: account,
                        scrapedAt: new Date().toISOString(),
                    };

                    await Actor.pushData(event);
                }
                log.debug(`@${account}: ${igAccSkippedNotEvent} posts skipped (not event-related), ${igAccSkippedBudget} skipped (budget)`);
            } catch (error) {
                log.exception(error as Error, `Failed to scrape Instagram account @${account}`);
            }
        }
    }

    // ========================================
    // STEP 4: Scrape TikTok for events
    // ========================================
    if (includeTikTok) {
        log.info('🎵 Step 4: Scraping TikTok for wellness events...');

        const tiktokHashtags = input.tiktokHashtags || ['yoga', 'meditation', 'wellness'];
        const tiktokAccounts = input.tiktokAccounts || [];

        // Scrape TikTok hashtags
        for (const hashtag of tiktokHashtags) {
            try {
                log.info(`Searching TikTok hashtag #${hashtag}...`);

                log.debug(`Calling clockworks/tiktok-hashtag-scraper for hashtag #${hashtag}`);
                const tiktokRun = await Actor.call('clockworks/tiktok-hashtag-scraper', {
                    hashtags: [hashtag],
                    resultsPerPage: 50,
                });

                log.debug(`TikTok hashtag run finished: runId=${tiktokRun.id}, status=${tiktokRun.status}, datasetId=${tiktokRun.defaultDatasetId}`);

                const { items } = await Actor.apifyClient
                    .dataset(tiktokRun.defaultDatasetId)
                    .listItems();

                log.info(`Found ${items.length} TikTok videos for #${hashtag}`);

                let ttSkippedNotEvent = 0;
                let ttSkippedBudget = 0;
                for (const video of items) {
                    const description = (video.text as string) || (video.desc as string) || '';
                    const isEvent = eventTypes.some(type =>
                        description.toLowerCase().includes(type.toLowerCase())
                    );

                    if (!isEvent) {
                        ttSkippedNotEvent++;
                        continue;
                    }

                    if (isEvent) {
                        const eventName = description.slice(0, 100) || `TikTok Event from @${video.authorMeta?.name}`;
                        const priceMatch = description.match(/\$(\d+)/);
                        const price = priceMatch ? `$${priceMatch[1]}` : 'See TikTok for details';
                        const priceNumeric = priceMatch ? parseInt(priceMatch[1]) : null;

                        if (!isWithinBudget(priceNumeric, budgetMin, budgetMax)) {
                            log.debug(`Skipping TikTok #${hashtag} video - price ${price} outside budget $${budgetMin}-${budgetMax ?? 'unlimited'}`);
                            ttSkippedBudget++;
                            continue;
                        }

                        const event: WellnessEvent = {
                            eventName,
                            eventType: 'TikTok Event',
                            eventDescription: description,
                            eventDate: video.createTimeISO || new Date().toISOString(),
                            eventUrl: video.webVideoUrl || `https://tiktok.com/@${video.authorMeta?.name}`,
                            registrationUrl: video.webVideoUrl,
                            price,
                            priceNumeric,
                            isOnline: description.toLowerCase().includes('online') || description.toLowerCase().includes('virtual'),
                            location: description.includes('online') ? 'Online' : 'See TikTok',
                            providerName: `@${video.authorMeta?.name}`,
                            providerType: 'TikTok',
                            providerUrl: `https://tiktok.com/@${video.authorMeta?.name}`,
                            source: 'tiktok',
                            socialHandle: video.authorMeta?.name,
                            scrapedAt: new Date().toISOString(),
                        };

                        await Actor.pushData(event);
                    }
                }
                log.debug(`#${hashtag}: ${ttSkippedNotEvent} TikTok videos skipped (not event-related), ${ttSkippedBudget} skipped (budget)`);
            } catch (error) {
                log.exception(error as Error, `Failed to scrape TikTok hashtag #${hashtag}`);
            }
        }

        // Scrape specific TikTok accounts
        for (const account of tiktokAccounts) {
            try {
                log.info(`Scraping TikTok account @${account}...`);

                log.debug(`Calling clockworks/tiktok-profile-scraper for @${account}`);
                const accountRun = await Actor.call('clockworks/tiktok-profile-scraper', {
                    profiles: [account],
                    resultsPerPage: 20,
                });

                log.debug(`TikTok profile run finished: runId=${accountRun.id}, status=${accountRun.status}, datasetId=${accountRun.defaultDatasetId}`);

                const { items } = await Actor.apifyClient
                    .dataset(accountRun.defaultDatasetId)
                    .listItems();

                log.info(`Found ${items.length} videos from @${account}`);

                let ttAccSkippedNotEvent = 0;
                let ttAccSkippedBudget = 0;
                for (const video of items) {
                    const description = (video.text as string) || (video.desc as string) || '';
                    const isEvent = eventTypes.some(type =>
                        description.toLowerCase().includes(type.toLowerCase())
                    );

                    if (!isEvent) {
                        ttAccSkippedNotEvent++;
                        continue;
                    }

                    if (isEvent) {
                        const eventName = description.slice(0, 100) || `Event from @${account}`;
                        const priceMatch = description.match(/\$(\d+)/);
                        const price = priceMatch ? `$${priceMatch[1]}` : 'See TikTok for details';
                        const priceNumeric = priceMatch ? parseInt(priceMatch[1]) : null;

                        if (!isWithinBudget(priceNumeric, budgetMin, budgetMax)) {
                            log.debug(`Skipping @${account} TikTok video - price ${price} outside budget $${budgetMin}-${budgetMax ?? 'unlimited'}`);
                            ttAccSkippedBudget++;
                            continue;
                        }

                        const event: WellnessEvent = {
                            eventName,
                            eventType: 'TikTok Event',
                            eventDescription: description,
                            eventDate: video.createTimeISO || new Date().toISOString(),
                            eventUrl: video.webVideoUrl || `https://tiktok.com/@${account}`,
                            registrationUrl: video.webVideoUrl,
                            price,
                            priceNumeric,
                            isOnline: description.toLowerCase().includes('online'),
                            location: 'See TikTok',
                            providerName: `@${account}`,
                            providerType: 'TikTok',
                            providerUrl: `https://tiktok.com/@${account}`,
                            source: 'tiktok',
                            socialHandle: account,
                            scrapedAt: new Date().toISOString(),
                        };

                        await Actor.pushData(event);
                    }
                }
                log.debug(`@${account}: ${ttAccSkippedNotEvent} TikTok videos skipped (not event-related), ${ttAccSkippedBudget} skipped (budget)`);
            } catch (error) {
                log.exception(error as Error, `Failed to scrape TikTok account @${account}`);
            }
        }
    }

    // ========================================
    // STEP 5: Scrape provider websites
    // ========================================
    if (providers.length === 0 && !includeInstagram && !includeTikTok) {
        log.warning('No providers found and social media scraping is disabled.');
        await Actor.exit();
        process.exit(0);
    }

    const providersToScrape = providers.slice(0, maxProviders);
    log.info(`📅 Step 5: Scraping events from ${providersToScrape.length} provider websites...`);

    // Set up proxy configuration
    const proxyConfiguration = await Actor.createProxyConfiguration(input.proxyConfiguration);

    // Track statistics
    let totalEventsFound = 0;
    let providersWithEvents = 0;

    // Scrape events from each provider's website
    for (const provider of providersToScrape) {
        if (!provider.website) continue;

        try {
            log.info(`Scraping events from ${provider.name} (${provider.website})`);

            const providerEvents: WellnessEvent[] = [];

            // Create a crawler for this provider
            const crawler = new CheerioCrawler({
                proxyConfiguration,
                maxRequestsPerCrawl: 5,
                requestHandler: async ({ $, request }) => {
                    log.debug(`Processing ${request.url}`);

                    // Common event indicators in HTML
                    const eventSelectors = [
                        '.event', '.class', '.workshop', '.session',
                        '[class*="event"]', '[class*="class"]', '[class*="workshop"]',
                        '[id*="event"]', '[id*="class"]', '[id*="schedule"]',
                    ];

                    // Try to find events using various selectors
                    for (const selector of eventSelectors) {
                        $(selector).each((_, element) => {
                            const $el = $(element);

                            // Extract event information
                            const eventName = $el.find('h1, h2, h3, h4, .title, .name').first().text().trim()
                                || $el.find('a').first().text().trim()
                                || 'Unnamed Event';

                            // Skip if this doesn't look like an event
                            if (eventName.length < 3 || eventName.length > 200) return;

                            // Try to extract date
                            const dateText = $el.find('.date, .time, [class*="date"]').text()
                                || $el.text();

                            // Try to extract URL
                            const eventLink = $el.find('a').first().attr('href') || '';
                            let eventUrl = '';
                            try {
                                eventUrl = eventLink.startsWith('http')
                                    ? eventLink
                                    : new URL(eventLink, request.url).href;
                            } catch (urlError) {
                                log.debug(`Could not resolve event URL "${eventLink}" relative to "${request.url}": ${(urlError as Error).message}`);
                            }

                            // Try to extract price
                            const priceText = $el.find('.price, [class*="price"], [class*="cost"]').text()
                                || $el.text().match(/\$\d+(?:\.\d{2})?|free/i)?.[0]
                                || 'Price not listed';
                            const priceNumeric = extractPrice(priceText);

                            // Check budget filter
                            if (!isWithinBudget(priceNumeric, budgetMin, budgetMax)) return;

                            // Determine if online
                            const text = $el.text().toLowerCase();
                            const isOnline = text.includes('online') || text.includes('virtual') || text.includes('zoom');

                            // Check online preference filter
                            if (onlinePreference === 'online' && !isOnline) return;
                            if (onlinePreference === 'in-person' && isOnline) return;

                            // Create event object
                            const event: WellnessEvent = {
                                eventName,
                                eventType: eventTypes[0],
                                eventDescription: includeDescription ? $el.find('.description, p').first().text().trim() : undefined,
                                eventDate: dateText,
                                eventTime: dateText,
                                eventUrl: eventUrl || request.url,
                                registrationUrl: eventUrl || provider.website,
                                price: priceText,
                                priceNumeric,
                                isOnline,
                                location: isOnline ? 'Online' : provider.address,
                                providerName: provider.name,
                                providerType: provider.type,
                                providerUrl: provider.website,
                                providerPhone: provider.phone,
                                providerEmail: provider.email,
                                providerAddress: provider.address,
                                source: 'website',
                                scrapedAt: new Date().toISOString(),
                            };

                            // Add to provider events if not duplicate
                            if (!providerEvents.some(e => e.eventName === event.eventName && e.eventDate === event.eventDate)) {
                                providerEvents.push(event);
                            }
                        });
                    }

                    // Look for schedule/calendar pages
                    const scheduleLinks = $('a[href*="schedule"], a[href*="calendar"], a[href*="events"], a[href*="classes"]');
                    scheduleLinks.each((_, link) => {
                        const href = $(link).attr('href');
                        if (href && !href.startsWith('#')) {
                            const fullUrl = href.startsWith('http') ? href : new URL(href, request.url).href;
                            if (!request.userData.visited?.has(fullUrl)) {
                                crawler.addRequests([{
                                    url: fullUrl,
                                    userData: { ...request.userData, visited: new Set([...(request.userData.visited || []), fullUrl]) },
                                }]);
                            }
                        }
                    });
                },
            });

            // Start crawling from the provider's website
            await crawler.run([{
                url: provider.website,
                userData: { provider, visited: new Set() },
            }]);

            // Limit events per provider
            const limitedEvents = providerEvents.slice(0, maxEventsPerProvider);

            if (limitedEvents.length > 0) {
                providersWithEvents++;
                totalEventsFound += limitedEvents.length;

                // Push events to dataset
                await Actor.pushData(limitedEvents);

                log.info(`✅ Found ${limitedEvents.length} events from ${provider.name}`);
            } else {
                log.debug(`No events found for ${provider.name}`);
            }

        } catch (error) {
            log.exception(error as Error, `Failed to scrape ${provider.name} (${provider.website})`);
        }
    }

    log.info('🎉 Scraping complete!');
    log.info(`📊 Statistics:
        - Providers searched: ${providersToScrape.length}
        - Providers with events: ${providersWithEvents}
        - Total website events: ${totalEventsFound}
        - Budget filter: $${budgetMin} - ${budgetMax === null ? 'unlimited' : `$${budgetMax}`}
        - Instagram enabled: ${includeInstagram}
        - TikTok enabled: ${includeTikTok}
    `);

} catch (error) {
    log.exception(error as Error, 'Actor failed with unhandled error');
    throw error;
}

// Gracefully exit the Actor
await Actor.exit();
