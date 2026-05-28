export const brand = {
  name: "Visora",
  descriptor: "AI-assisted local visibility platform",
  email: "support@mappack3.com",
};

export type FAQItem = {
  question: string;
  answer: string;
};

export type ServicePage = {
  slug: string;
  navLabel: string;
  title: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  icon: string;
  whatItIs: string;
  whyItMatters: string;
  platformDoes: string[];
  checks?: string[];
  examples?: string[];
  ownerControl?: string[];
  faqs?: FAQItem[];
};

export type LearnPage = {
  slug: string;
  navLabel: string;
  title: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  sections: {
    heading: string;
    body: string;
    bullets?: string[];
  }[];
  checklist?: {
    heading: string;
    items: string[];
  }[];
};

export type RelatedLink = {
  label: string;
  href: string;
};

export const outcomeFramework = [
  {
    title: "Get found",
    body: "Improve the signals that help nearby customers find you on Google Search, Maps, and local directories.",
  },
  {
    title: "Look trustworthy",
    body: "Keep reviews, photos, Q&A, profile details, and website basics working together so people feel comfortable calling.",
  },
  {
    title: "Stay consistent",
    body: "Catch mismatched business information before it confuses customers or makes your business look neglected.",
  },
  {
    title: "Turn interest into leads",
    body: "Use lead recovery, follow-up, alerts, and reporting so hard-earned visibility does not become missed opportunity.",
  },
];

export const servicePages: ServicePage[] = [
  {
    slug: "google-business-profile",
    navLabel: "Google Business Profile",
    title: "Google Business Profile management that makes your listing easier to trust.",
    excerpt:
      "Your Google Business Profile is the business listing people see on Google Search and Maps. Visora helps keep it complete, current, and useful.",
    metaTitle: "Google Business Profile Management | Visora",
    metaDescription:
      "Manage Google Business Profile details, services, photos, posts, Q&A, and reviews with an AI-assisted local visibility platform.",
    icon: "map",
    whatItIs:
      "A Google Business Profile, often called GBP, is the business listing that shows up on Google Search and Maps. It includes your hours, phone number, address, services, reviews, photos, posts, questions, and directions.",
    whyItMatters:
      "Many customers decide whether to call from this profile before they ever visit your website. Missing hours, thin service details, old photos, or unanswered questions can make a good business feel harder to choose.",
    platformDoes: [
      "Audits business information, categories, services, descriptions, hours, photos, posts, Q&A, and review signals.",
      "Uses AI-assisted checks to spot gaps faster, while keeping important changes visible to the owner.",
      "Turns profile improvements into a simple task list instead of a confusing SEO project.",
      "Connects profile health to reviews, citations, posting, and visibility tracking.",
    ],
    checks: [
      "Business name, address, phone, hours, and service areas",
      "Primary and secondary categories",
      "Service list and service descriptions",
      "Business description and local relevance",
      "Recent photos, posts, Q&A, and review activity",
    ],
    examples: [
      "A roofer lists repairs but forgets emergency roof tarping.",
      "A med spa has strong reviews but no recent photos.",
      "An HVAC company has outdated holiday hours during peak season.",
    ],
  },
  {
    slug: "gbp-posting",
    navLabel: "GBP Posting & Content",
    title: "Google Business Profile posts without another weekly chore.",
    excerpt:
      "Keep your profile active with helpful updates, service highlights, offers, and seasonal reminders written in plain language.",
    metaTitle: "GBP Posting and Content | Visora",
    metaDescription:
      "Create AI-assisted Google Business Profile posts for offers, updates, services, seasonal reminders, and local announcements.",
    icon: "edit",
    whatItIs:
      "GBP posts are short updates that can appear on your business profile. They can highlight offers, services, seasonal needs, announcements, and useful reminders.",
    whyItMatters:
      "A quiet profile can look stale. Regular posts help show that your business is active, organized, and paying attention to what customers care about right now.",
    platformDoes: [
      "Creates templated and AI-assisted post drafts based on your services, locations, seasons, and business goals.",
      "Helps connect posts to real customer searches such as drain cleaning, roof repair, Botox consultation, or emergency HVAC.",
      "Keeps copy helpful instead of spammy, with owner approval where needed.",
      "Tracks what was planned and published so posting does not disappear when the week gets busy.",
    ],
    checks: [
      "Offers and limited-time updates",
      "Service highlights",
      "Seasonal reminders",
      "Local announcements",
      "Before-and-after or work photo prompts",
    ],
  },
  {
    slug: "gbp-audits",
    navLabel: "GBP Content Audits",
    title: "Regular GBP content audits that catch the details customers notice.",
    excerpt:
      "Find outdated, thin, missing, or mismatched profile content before it weakens trust or local relevance.",
    metaTitle: "GBP Content Audits | Visora",
    metaDescription:
      "Audit Google Business Profile services, categories, descriptions, posts, photos, Q&A, and business information.",
    icon: "clipboard",
    whatItIs:
      "A content audit is a plain-language review of what your Google Business Profile says about your business and what it leaves out.",
    whyItMatters:
      "Your profile should make it easy for someone to trust you, call you, and choose you. Small gaps can create doubt, especially when nearby competitors look more complete.",
    platformDoes: [
      "Checks for missing services, outdated hours, weak descriptions, thin posts, category issues, and stale photos.",
      "Uses AI-assisted analysis to find gaps and explain them in business-owner language.",
      "Turns findings into clear next steps instead of a long technical report.",
      "Keeps a record of what changed over time.",
    ],
    examples: [
      "A missing service that customers search for every week.",
      "Outdated hours that make callers unsure you are open.",
      "A weak description that does not explain service areas.",
      "No recent photos even though the team has finished great work.",
      "A category mismatch that makes the profile less relevant.",
    ],
  },
  {
    slug: "review-management",
    navLabel: "Review Management",
    title: "Review requests and review management that feel natural, not pushy.",
    excerpt:
      "Ask at the right time, monitor incoming reviews, and respond with care so trust keeps building.",
    metaTitle: "Review Management | Visora",
    metaDescription:
      "Automate review requests, monitor reviews, draft AI-assisted responses, and keep owner approval in the loop.",
    icon: "star",
    whatItIs:
      "Review management means asking happy customers for feedback, watching new reviews, and responding in a way that reflects your business.",
    whyItMatters:
      "Customers look at review count, rating, recency, and responses before they call. A strong review profile can turn a searcher into a lead before your team says a word.",
    platformDoes: [
      "Sends review requests through simple workflows at the moments most likely to get a response.",
      "Monitors new reviews and brings urgent items to the surface.",
      "Uses AI-assisted response drafts to save time without removing owner judgment.",
      "Supports approval workflows for positive and negative review responses.",
    ],
    ownerControl: [
      "Choose when requests are sent.",
      "Review response drafts before publishing where approval is enabled.",
      "Flag sensitive reviews for human handling.",
    ],
  },
  {
    slug: "review-monitoring",
    navLabel: "Review Monitoring",
    title: "Multi-source review monitoring in one calm place.",
    excerpt:
      "Customers may review you on Google, Facebook, Yelp, and industry sites. Visora helps you avoid missing the reviews that matter.",
    metaTitle: "Multi-Source Review Monitoring | Visora",
    metaDescription:
      "Pull and normalize reviews from multiple sources so business owners can spot praise, complaints, and urgent issues.",
    icon: "messages",
    whatItIs:
      "Multi-source review monitoring brings reviews from different platforms into one view so owners do not have to keep checking every site manually.",
    whyItMatters:
      "A complaint on the wrong site can sit unnoticed. Patterns in praise or frustration can also show what your business should repeat or fix.",
    platformDoes: [
      "Pulls and normalizes review data from connected sources where available.",
      "Highlights urgent reviews, repeated complaints, and positive themes.",
      "Helps owners compare rating, volume, recency, and response status across sources.",
      "Keeps review monitoring connected to reporting and follow-up.",
    ],
    examples: [
      "A Google review praises a technician by name.",
      "A Facebook review mentions slow scheduling.",
      "An industry-site review points to a recurring service question.",
    ],
  },
  {
    slug: "citation-management",
    navLabel: "Citation Management",
    title: "Citation management that keeps your business information consistent.",
    excerpt:
      "Citations are online listings of your business name, address, and phone number across directories like Yelp, Apple Maps, Bing, and other listing sites.",
    metaTitle: "Citation Management | Visora",
    metaDescription:
      "Find business listings, detect NAP mismatches, normalize citation data, and flag missing or incorrect directories.",
    icon: "list",
    whatItIs:
      "Citations are online listings of your business name, address, and phone number across directories like Yelp, Apple Maps, Bing, and other listing sites. NAP means name, address, and phone.",
    whyItMatters:
      "When listings disagree, customers get confused and your business can look less professional. Consistency also supports the wider set of local visibility signals.",
    platformDoes: [
      "Finds listings across directories and local data sources where integrations are enabled.",
      "Detects mismatched names, phone numbers, addresses, websites, and categories.",
      "Normalizes information into a clean business record.",
      "Flags missing or incorrect listings so fixes can be prioritized.",
    ],
    examples: [
      "Old phone number on a directory.",
      "Former address still appearing after a move.",
      "Different business names across listing sites.",
      "Missing website URL on a high-traffic directory.",
    ],
  },
  {
    slug: "local-rank-tracking",
    navLabel: "Rank Tracking",
    title: "Local rank tracking that explains where you are visible.",
    excerpt:
      "See how your business shows up for important searches by location, keyword, and competitor context.",
    metaTitle: "Local Rank Tracking and Visibility | Visora",
    metaDescription:
      "Track local visibility by keyword, zip code, city, and competitor movement without needing to become an SEO expert.",
    icon: "radar",
    whatItIs:
      "Local visibility means how easy it is for nearby customers to find you when they search for your services. Rankings can change by city, zip code, neighborhood, and distance from your location.",
    whyItMatters:
      "You might rank well near your office but not two towns over. Tracking helps owners see where visibility is strong, weak, or moving.",
    platformDoes: [
      "Tracks keywords tied to real services and locations.",
      "Shows movement over time instead of one confusing snapshot.",
      "Compares visibility against nearby competitors where available.",
      "Connects ranking changes to profile, review, content, and citation work.",
    ],
    examples: [
      "Plumber near me",
      "Roof repair Media PA",
      "Best med spa in Wilmington",
      "Emergency HVAC service",
    ],
  },
  {
    slug: "competitor-monitoring",
    navLabel: "Competitor Monitoring",
    title: "Competitor monitoring that keeps you aware, not obsessed.",
    excerpt:
      "Understand what nearby competitors are doing well so you can make better local visibility decisions.",
    metaTitle: "Competitor Monitoring | Visora",
    metaDescription:
      "Monitor local competitors by reviews, ratings, posting frequency, services promoted, profile completeness, and ranking movement.",
    icon: "users",
    whatItIs:
      "Competitor monitoring is a practical view of nearby businesses that show up for the same searches you care about.",
    whyItMatters:
      "Customers compare options quickly. Knowing why a competitor looks more complete, more reviewed, or more active helps you improve your own first impression.",
    platformDoes: [
      "Tracks review count, rating differences, posting frequency, services promoted, and ranking movement.",
      "Compares profile completeness in plain language.",
      "Highlights useful patterns without turning the dashboard into a scoreboard.",
      "Helps owners decide what to fix first.",
    ],
    checks: [
      "Review count and rating gaps",
      "Posting frequency",
      "Services and categories promoted",
      "Ranking movement",
      "Profile completeness",
    ],
  },
  {
    slug: "local-website-seo-audits",
    navLabel: "Website & SEO Audits",
    title: "Local website and SEO audits that connect your site to local trust.",
    excerpt:
      "Your website still matters. Visora checks the basics that help visitors understand, trust, and contact your business.",
    metaTitle: "Local Website and SEO Audits | Visora",
    metaDescription:
      "Audit local business websites for mobile experience, speed, titles, service pages, location pages, schema, and calls to action.",
    icon: "monitor",
    whatItIs:
      "A local website audit looks at whether your site clearly supports the services, locations, and calls to action customers need after they find you.",
    whyItMatters:
      "Google Business Profile gets attention, but many customers still click through before calling. A confusing, slow, or incomplete site can waste good visibility.",
    platformDoes: [
      "Checks mobile experience, speed, page titles, meta descriptions, service pages, location pages, calls to action, schema, and contact information.",
      "Explains issues in owner-friendly language.",
      "Connects website gaps to local visibility and conversion, not just technical scores.",
      "Can support website improvement conversations where that work is part of the engagement.",
    ],
    checks: [
      "Mobile experience and speed",
      "Title tags and meta descriptions",
      "Service and location pages",
      "Calls to action and contact info",
      "Local schema and business details",
    ],
  },
  {
    slug: "photo-image-requests",
    navLabel: "Photo Requests",
    title: "Photo and image requests that make your business feel real.",
    excerpt:
      "Recent photos help customers see your work, team, space, and results before they decide to call.",
    metaTitle: "Photo and Image Requests | Visora",
    metaDescription:
      "Request before-and-after photos, team photos, work photos, location photos, and images that support GBP posts.",
    icon: "camera",
    whatItIs:
      "Photo requests are simple prompts that remind your team or owner to capture useful business images.",
    whyItMatters:
      "Fresh photos can build trust quickly. Before-and-after work, team photos, vehicles, offices, treatment rooms, and completed jobs all help customers picture the business they are choosing.",
    platformDoes: [
      "Requests images from the owner or team based on services, seasons, and content needs.",
      "Connects images to GBP posts and profile improvements.",
      "Helps organize photo needs without turning it into another spreadsheet.",
      "Encourages practical photos over generic stock images.",
    ],
    examples: [
      "Before-and-after project photos",
      "Team and vehicle photos",
      "Treatment room or storefront photos",
      "Seasonal service photos",
      "Finished work examples",
    ],
  },
  {
    slug: "qa-management",
    navLabel: "GBP Q&A",
    title: "Google Q&A management that answers questions before they become lost calls.",
    excerpt:
      "The Google Q&A section can shape first impressions. Visora helps create helpful answers for common customer questions.",
    metaTitle: "Google Business Profile Q&A Management | Visora",
    metaDescription:
      "Generate helpful GBP Q&A answers for pricing, service area, availability, emergency services, booking, and guarantees.",
    icon: "help",
    whatItIs:
      "Google Q&A is a section on your Business Profile where people can ask questions and see answers. It is easy to forget, but customers notice unanswered questions.",
    whyItMatters:
      "Unanswered questions can make a business look unavailable or disorganized. Helpful answers reduce friction before someone calls.",
    platformDoes: [
      "Identifies common questions customers are likely to ask.",
      "Uses AI-assisted drafts for clear answers that owners can review.",
      "Covers pricing guidance, service area, availability, emergency work, booking, guarantees, and preparation.",
      "Keeps answers aligned with your actual policies.",
    ],
    examples: [
      "Do you serve my area?",
      "Do you offer emergency appointments?",
      "How do I book?",
      "Do you provide estimates?",
      "What should I do before my appointment?",
    ],
  },
  {
    slug: "lead-recovery",
    navLabel: "Lead Recovery",
    title: "Lead recovery that helps turn local visibility into real opportunity.",
    excerpt:
      "Missed calls and slow follow-up lose local customers. Visora can text missed callers, collect job details, and notify the owner.",
    metaTitle: "Lead Recovery and Missed Call Text-Back | Visora",
    metaDescription:
      "Recover missed calls with text-back, customer intake, owner alerts, and lead summaries while keeping your current phone number.",
    icon: "phone",
    whatItIs:
      "Lead recovery helps follow up when a local customer calls and the business cannot answer. This is where visibility becomes opportunity.",
    whyItMatters:
      "Visibility gets you found. Reputation helps people trust you. Lead recovery helps you avoid wasting the attention you earned.",
    platformDoes: [
      "Supports missed call text-back where enabled.",
      "Collects customer intake such as service needed, location, urgency, preferred time, and name.",
      "Sends the owner a summary so follow-up starts with context.",
      "Supports Option B: keep your current phone number and forward missed or unanswered calls to your recovery number.",
    ],
    checks: [
      "Service needed",
      "Customer location",
      "Urgency",
      "Preferred time",
      "Name and contact details",
    ],
    ownerControl: [
      "Keep your current phone number.",
      "Choose forwarding rules where supported.",
      "Review lead details in the inbox and alerts.",
      "Pause or adjust workflows as needed.",
    ],
  },
  {
    slug: "reporting",
    navLabel: "Reporting",
    title: "Reporting that shows what happened without another messy spreadsheet.",
    excerpt:
      "See posts, reviews, citations, visibility, lead recovery, and issues needing attention in one dashboard.",
    metaTitle: "Local SEO Reporting Dashboard | Visora",
    metaDescription:
      "Track local SEO work, GBP posts, reviews, citations, visibility movement, lead recovery, and action items in one dashboard.",
    icon: "chart",
    whatItIs:
      "Reporting is the owner-friendly view of what was done, what changed, and what still needs attention.",
    whyItMatters:
      "No more guessing what was done this month. Clear reporting helps owners understand progress without needing to become SEO experts.",
    platformDoes: [
      "Shows posts, reviews, citations, visibility, lead recovery, and issues needing attention.",
      "Turns local SEO activity into business-friendly summaries.",
      "Highlights what is automated and what needs owner input.",
      "Gives admins visibility across clients or locations where enabled.",
    ],
    checks: [
      "Posts and content activity",
      "Review requests and review changes",
      "Citation issues",
      "Visibility movement",
      "Lead recovery activity",
      "Open tasks and alerts",
    ],
  },
];

export const learnPages: LearnPage[] = [
  {
    slug: "what-is-local-seo",
    navLabel: "What is Local SEO?",
    title: "What is local SEO?",
    excerpt:
      "Local SEO means helping nearby customers find your business when they search online for the services you provide.",
    metaTitle: "What Is Local SEO? | Visora Learn",
    metaDescription:
      "A plain-language guide to local SEO for business owners, including Google Business Profile, reviews, citations, website signals, and photos.",
    sections: [
      {
        heading: "The simple definition",
        body: "Local SEO is not one magic trick. It is a group of signals that work together so nearby customers can find, trust, and contact your business.",
      },
      {
        heading: "What customers actually search",
        body: "Most searches are practical and urgent. People often compare only a few options before calling.",
        bullets: ["plumber near me", "best med spa in Wilmington", "roof repair Media PA", "emergency HVAC service"],
      },
      {
        heading: "How local SEO differs from regular SEO",
        body: "Traditional SEO often focuses on ranking pages across a broad market. Local SEO focuses on business profiles, maps, reviews, distance, local pages, listings, and trust signals in specific service areas.",
      },
      {
        heading: "Why it is ongoing",
        body: "Competitors keep earning reviews, changing profiles, posting updates, and improving websites. Local SEO works best when the important pieces keep moving.",
      },
    ],
  },
  {
    slug: "google-map-pack",
    navLabel: "Google Map Pack",
    title: "What is the Google Map Pack?",
    excerpt:
      "The Map Pack is the map and business listing area that appears for many local searches on Google.",
    metaTitle: "What Is the Google Map Pack? | Visora Learn",
    metaDescription:
      "Learn what the Google Map Pack is, why it matters, and what affects local visibility in simple business-owner language.",
    sections: [
      {
        heading: "The part of Google many customers call from",
        body: "When someone searches for a local service, Google often shows a map with a short list of nearby businesses. That area is commonly called the Google Map Pack.",
      },
      {
        heading: "Why it matters",
        body: "Customers can call, get directions, read reviews, view photos, and compare businesses without leaving Google. If your profile looks incomplete, another business may feel easier to choose.",
      },
      {
        heading: "What affects visibility",
        body: "Google uses many signals. The easiest way to think about them is relevance, distance, and prominence or trust.",
        bullets: ["Profile completeness", "Services and categories", "Reviews and review recency", "Website and local signals", "Photos, posts, and business information consistency"],
      },
    ],
  },
  {
    slug: "google-business-profile",
    navLabel: "Google Business Profile",
    title: "What is a Google Business Profile?",
    excerpt:
      "A Google Business Profile is the business listing that appears on Google Search and Maps.",
    metaTitle: "What Is a Google Business Profile? | Visora Learn",
    metaDescription:
      "Understand Google Business Profile basics: hours, reviews, photos, services, posts, Q&A, and why the listing matters.",
    sections: [
      {
        heading: "Your business listing on Google",
        body: "A Google Business Profile includes your name, address, phone, hours, reviews, photos, services, posts, Q&A, and links for calling or directions.",
      },
      {
        heading: "Why neglect hurts trust",
        body: "Customers notice old photos, missing services, unanswered questions, and reviews with no response. Your profile should make calling you feel easy.",
      },
      {
        heading: "What to keep current",
        body: "Start with the basics, then keep improving the profile over time.",
        bullets: ["Hours", "Services", "Photos", "Posts", "Q&A", "Reviews and responses", "Business description"],
      },
    ],
  },
  {
    slug: "why-reviews-matter",
    navLabel: "Why Reviews Matter",
    title: "Why reviews matter for local businesses.",
    excerpt:
      "Reviews build trust before someone calls. Count, rating, recency, and responses all shape the decision.",
    metaTitle: "Why Reviews Matter | Visora Learn",
    metaDescription:
      "Learn why reviews influence trust and conversion, how to ask responsibly, and how to handle negative reviews.",
    sections: [
      {
        heading: "Reviews are part of the first impression",
        body: "A customer may not know your business yet, but they can quickly see what other people experienced. That trust can be the difference between a call and a skipped listing.",
      },
      {
        heading: "What people look at",
        body: "Humans notice more than the star rating.",
        bullets: ["How many reviews you have", "How recent they are", "What customers mention", "How the business responds", "Whether complaints look handled"],
      },
      {
        heading: "Handling negative reviews",
        body: "A thoughtful response should acknowledge the concern, avoid arguments, protect private details, and move the conversation to a direct channel when appropriate.",
      },
    ],
  },
  {
    slug: "what-are-citations",
    navLabel: "What Are Citations?",
    title: "What are citations?",
    excerpt:
      "Citations are online listings of your business name, address, and phone number across directories and listing sites.",
    metaTitle: "What Are Citations? | Visora Learn",
    metaDescription:
      "A simple explanation of citations, NAP consistency, and why mismatched listings can confuse customers.",
    sections: [
      {
        heading: "The plain-language definition",
        body: "Citations are online listings of your business name, address, and phone number across directories like Yelp, Apple Maps, Bing, and other local listing sites.",
      },
      {
        heading: "NAP means name, address, phone",
        body: "NAP consistency means your basic business information matches across the web. It sounds small, but customers rely on those details.",
      },
      {
        heading: "Why mismatches matter",
        body: "An old phone number, former address, or different business name can confuse customers and make your business look less professional.",
      },
    ],
  },
  {
    slug: "local-seo-checklist",
    navLabel: "Local SEO Checklist",
    title: "A practical local SEO checklist for business owners.",
    excerpt:
      "Use this checklist to spot the basics that affect local visibility, trust, consistency, and follow-up.",
    metaTitle: "Local SEO Checklist | Visora Learn",
    metaDescription:
      "A helpful local SEO checklist covering Google Business Profile, reviews, citations, website, photos, posting, lead follow-up, and reporting.",
    sections: [
      {
        heading: "How to use this checklist",
        body: "You do not need to become an SEO expert. Work through the basics, fix what is missing, and revisit the list regularly.",
      },
    ],
    checklist: [
      {
        heading: "Google Business Profile",
        items: ["Confirm hours, phone, website, and service areas.", "Review categories and service list.", "Add a clear business description."],
      },
      {
        heading: "Reviews",
        items: ["Ask happy customers at the right time.", "Respond to reviews thoughtfully.", "Watch for repeated praise or complaints."],
      },
      {
        heading: "Citations",
        items: ["Check name, address, and phone consistency.", "Flag old addresses or phone numbers.", "Look for missing high-value listings."],
      },
      {
        heading: "Website",
        items: ["Make sure it works well on mobile.", "Create clear service and location pages.", "Make calls and contact forms easy to find."],
      },
      {
        heading: "Photos and posting",
        items: ["Add recent work or team photos.", "Post useful service updates.", "Use seasonal reminders when they help customers."],
      },
      {
        heading: "Lead follow-up and reporting",
        items: ["Track missed calls.", "Summarize new leads.", "Review what changed each month."],
      },
    ],
  },
  {
    slug: "local-seo-for-service-businesses",
    navLabel: "Service Business SEO",
    title: "Local SEO for service businesses.",
    excerpt:
      "Contractors, med spas, salons, dentists, auto services, cleaners, landscapers, roofers, HVAC companies, and other local businesses all win trust in slightly different ways.",
    metaTitle: "Local SEO for Service Businesses | Visora Learn",
    metaDescription:
      "Examples of local SEO for HVAC, plumbing, roofing, med spas, salons, cleaners, landscapers, auto repair, dentists, and contractors.",
    sections: [
      {
        heading: "How people compare service businesses",
        body: "Customers usually search, scan the Map Pack, compare reviews and photos, check the website if they are unsure, then call or message the business that feels easiest to trust.",
      },
      {
        heading: "Examples by industry",
        body: "The details change by industry, but the pattern is similar: be findable, look trustworthy, stay consistent, and respond quickly.",
        bullets: [
          "HVAC and plumbing: emergency availability, service areas, review recency, and fast follow-up.",
          "Roofing and contractors: project photos, service categories, estimates, and local proof.",
          "Med spas and salons: photos, treatments, booking clarity, reviews, and Q&A.",
          "Cleaners and landscapers: service packages, neighborhoods served, before-and-after photos, and recurring work.",
          "Auto repair and detailing: specialties, hours, reviews, photos, and easy booking.",
          "Dentists: insurance guidance, services, reviews, location details, and appointment flow.",
        ],
      },
    ],
  },
  {
    slug: "local-seo-vs-traditional-seo",
    navLabel: "Local vs Traditional SEO",
    title: "Local SEO vs traditional SEO.",
    excerpt:
      "Local SEO focuses on nearby customers, Maps visibility, reviews, listings, and business profile trust signals.",
    metaTitle: "Local SEO vs Traditional SEO | Visora Learn",
    metaDescription:
      "Compare local SEO and traditional SEO in plain language for local business owners.",
    sections: [
      {
        heading: "Traditional SEO",
        body: "Traditional SEO usually focuses on ranking website pages for broader searches. It often leans on content, links, technical health, and search intent across a large market.",
      },
      {
        heading: "Local SEO",
        body: "Local SEO focuses on the signals that help nearby customers find and choose a business: Google Business Profile, reviews, citations, service areas, location pages, photos, and calls.",
      },
      {
        heading: "Why local businesses need both",
        body: "A strong website helps, but your profile, reviews, listings, and follow-up often shape the first decision. The best local presence connects all of those pieces.",
      },
    ],
  },
  {
    slug: "local-visibility-turns-into-leads",
    navLabel: "Visibility Into Leads",
    title: "How local visibility turns into leads.",
    excerpt:
      "Getting found is only the first step. Trust and follow-up decide whether attention becomes a real opportunity.",
    metaTitle: "How Local Visibility Turns Into Leads | Visora Learn",
    metaDescription:
      "Learn how visibility, reputation, consistency, and lead recovery work together to create more local opportunities.",
    sections: [
      {
        heading: "The customer path is short",
        body: "A local customer may search, compare two or three businesses, read reviews, check photos, and call within minutes.",
      },
      {
        heading: "The four-part framework",
        body: "Visibility gets you found. Reputation helps people trust you. Consistency removes doubt. Lead recovery helps you avoid wasting the attention you earned.",
      },
      {
        heading: "Where AI helps",
        body: "AI-assisted audits, post drafts, review response drafts, Q&A suggestions, and lead summaries can keep the important pieces moving without making the owner do every small task manually.",
      },
    ],
  },
];

export const serviceFaqs: Record<string, FAQItem[]> = {
  "google-business-profile": [
    {
      question: "What is a Google Business Profile?",
      answer:
        "A Google Business Profile is the listing for your business on Google Search and Maps. It includes hours, services, photos, reviews, posts, questions, directions, and call links.",
    },
    {
      question: "Why does my profile need to be complete?",
      answer:
        "A complete profile helps customers quickly understand what you do, where you serve, whether you are open, and whether your business feels active and trustworthy.",
    },
    {
      question: "Can an outdated profile hurt trust?",
      answer:
        "Yes. Old hours, missing services, stale photos, or unanswered questions can make a good business look harder to choose, even when the business itself is strong.",
    },
    {
      question: "How often should a profile be reviewed?",
      answer:
        "Review the basics whenever hours, services, locations, policies, or contact details change. A broader profile audit is useful on a regular monthly or quarterly rhythm.",
    },
  ],
  "gbp-posting": [
    {
      question: "What should I post on my Google Business Profile?",
      answer:
        "Helpful GBP posts can include service highlights, seasonal reminders, limited offers, project updates, hiring notes, business announcements, and answers to common customer questions.",
    },
    {
      question: "How often should a local business post?",
      answer:
        "A steady rhythm matters more than volume. Many local businesses benefit from weekly or seasonal updates that are useful to customers and aligned with real services.",
    },
    {
      question: "Can posts promote services and offers?",
      answer:
        "Yes, as long as the post is accurate and not misleading. Offers, service reminders, and local updates can help customers understand what to do next.",
    },
  ],
  "gbp-audits": [
    {
      question: "What does a Google Business Profile audit check?",
      answer:
        "A GBP audit reviews business details, categories, services, photos, posts, Q&A, reviews, hours, service areas, and whether the profile clearly explains why a customer should call.",
    },
    {
      question: "Why do missing services matter?",
      answer:
        "Customers often search for specific services. If a service is missing or vague, your profile may feel less relevant or less helpful than nearby competitors.",
    },
    {
      question: "Does a profile audit guarantee better rankings?",
      answer:
        "No. An audit finds issues and opportunities. Rankings depend on many factors, but fixing weak or outdated profile content can improve trust and clarity.",
    },
  ],
  "review-management": [
    {
      question: "Why do reviews matter for local businesses?",
      answer:
        "Reviews shape trust before someone calls. Customers look at rating, count, recency, details in the comments, and whether the business responds thoughtfully.",
    },
    {
      question: "When should I ask for a review?",
      answer:
        "Ask after a positive service moment, completed job, appointment, or customer interaction while the experience is still fresh and the request feels natural.",
    },
    {
      question: "Can I automate review requests?",
      answer:
        "Yes. Review request automation can save time, but the message should still be respectful, accurate, and compliant with platform rules.",
    },
    {
      question: "Should I respond to negative reviews?",
      answer:
        "Usually yes. A calm response can show future customers that you listen and handle concerns professionally. Avoid arguments and protect private details.",
    },
  ],
  "review-monitoring": [
    {
      question: "What is multi-source review monitoring?",
      answer:
        "It means watching reviews from more than one platform so owners can see new feedback, urgent complaints, and repeated themes without checking each site manually.",
    },
    {
      question: "Which review sources matter most?",
      answer:
        "Google is central for many local searches, but Facebook, Yelp, industry directories, and niche platforms can also matter depending on the business.",
    },
    {
      question: "Can review monitoring show patterns?",
      answer:
        "Yes. Monitoring can reveal repeated praise, recurring complaints, service issues, response gaps, and customer language that should guide business decisions.",
    },
  ],
  "citation-management": [
    {
      question: "What are local citations?",
      answer:
        "Local citations are online listings of your business name, address, and phone number on directories, maps, industry sites, and local data sources.",
    },
    {
      question: "What does NAP mean?",
      answer:
        "NAP means name, address, and phone. NAP consistency means those details match across the places where customers find your business.",
    },
    {
      question: "Why do incorrect listings matter?",
      answer:
        "Incorrect listings can send customers to the wrong phone number, address, or website. They also make the business look less organized.",
    },
    {
      question: "Which directories matter?",
      answer:
        "The right directories vary by industry and market. Common sources include Google, Apple Maps, Bing, Yelp, Facebook, and relevant industry directories.",
    },
  ],
  "local-rank-tracking": [
    {
      question: "Why do rankings change by location?",
      answer:
        "Local results depend on relevance, distance, competition, and trust signals. A business may be visible near its office but weaker in a neighboring town.",
    },
    {
      question: "What keywords should a local business track?",
      answer:
        "Track real service searches customers use, such as emergency HVAC service, roof repair, plumber near me, med spa consultation, or auto detailer near me.",
    },
    {
      question: "What is local visibility?",
      answer:
        "Local visibility is how easy it is for nearby customers to find and compare your business when they search for services you provide.",
    },
  ],
  "competitor-monitoring": [
    {
      question: "What should I monitor about local competitors?",
      answer:
        "Useful signals include review count, review recency, rating, posting frequency, services promoted, profile completeness, photos, and ranking movement.",
    },
    {
      question: "Is competitor tracking about copying competitors?",
      answer:
        "No. It is about understanding what customers see when they compare options so you can improve your own profile, reviews, content, and follow-up.",
    },
    {
      question: "Can competitor monitoring show why they are more visible?",
      answer:
        "It can show useful clues, but it cannot prove every ranking factor. Local results are influenced by many signals and by searcher location.",
    },
  ],
  "local-website-seo-audits": [
    {
      question: "Why does a local business website still matter?",
      answer:
        "Many customers click from Google to the website before calling. A clear, fast, mobile-friendly site can support trust and turn visibility into action.",
    },
    {
      question: "What should a local website audit include?",
      answer:
        "Useful checks include mobile experience, speed, service pages, location pages, title tags, schema, calls to action, contact details, and page clarity.",
    },
    {
      question: "Do I need a new website to improve local SEO?",
      answer:
        "Not always. Many businesses can start by improving pages, calls to action, titles, service descriptions, and contact information on the existing site.",
    },
  ],
  "photo-image-requests": [
    {
      question: "Why do photos matter for a local business?",
      answer:
        "Photos help customers see the work, team, location, equipment, and results. Recent real photos can make the business feel more active and trustworthy.",
    },
    {
      question: "What photos should a local business collect?",
      answer:
        "Useful photos include finished work, before-and-after examples, team photos, vehicles, storefronts, treatment rooms, service areas, and seasonal work.",
    },
    {
      question: "Can photos support Google Business Profile posts?",
      answer:
        "Yes. Practical photos can make posts more useful and help customers understand the service or result being discussed.",
    },
  ],
  "qa-management": [
    {
      question: "What is Google Business Profile Q&A?",
      answer:
        "Google Q&A is the question-and-answer section on a Google Business Profile where people can ask about services, availability, pricing, policies, and booking.",
    },
    {
      question: "Why should a business answer Q&A?",
      answer:
        "Helpful answers reduce confusion before someone calls and can prevent unanswered questions from making the business look inactive.",
    },
    {
      question: "Can Q&A answers be drafted automatically?",
      answer:
        "AI-assisted drafts can save time, but owners should review answers so policies, pricing guidance, service areas, and guarantees stay accurate.",
    },
  ],
  "lead-recovery": [
    {
      question: "Do I need to change my phone number?",
      answer:
        "Not necessarily. Option B lets you keep your current number and forward missed or unanswered calls to a recovery number where that setup is enabled.",
    },
    {
      question: "What happens when I miss a call?",
      answer:
        "The workflow can text the missed caller, ask what they need, collect basic job details, and send the owner a summary for follow-up.",
    },
    {
      question: "Can the system collect job details?",
      answer:
        "Yes. It can collect service needed, location, urgency, preferred time, name, and contact details so the owner has context before calling back.",
    },
    {
      question: "Does this replace my receptionist?",
      answer:
        "No. Lead recovery helps when calls are missed or unanswered. It supports your team; it does not replace live customer service.",
    },
    {
      question: "Can I turn it off?",
      answer:
        "Yes. Lead recovery workflows should be adjustable or paused when the business needs to change how follow-up works.",
    },
  ],
  reporting: [
    {
      question: "What should local SEO reporting show?",
      answer:
        "Useful reporting shows what was done, what changed, what needs attention, and how profile, review, citation, visibility, and lead recovery work connect.",
    },
    {
      question: "Is reporting only for SEO experts?",
      answer:
        "No. Visora reporting is designed to explain local visibility work in owner-friendly language, not bury decisions in technical charts.",
    },
    {
      question: "Can reporting show open issues?",
      answer:
        "Yes. Reporting can highlight profile gaps, stale content, review response needs, citation issues, missed calls, and other items that need attention.",
    },
  ],
};

export const serviceRelatedLinks: Record<string, RelatedLink[]> = {
  "google-business-profile": [
    { label: "GBP posting and content", href: "/services/gbp-posting" },
    { label: "GBP content audits", href: "/services/gbp-audits" },
    { label: "Review management", href: "/services/review-management" },
    { label: "Google Q&A management", href: "/services/qa-management" },
  ],
  "gbp-posting": [
    { label: "Google Business Profile management", href: "/services/google-business-profile" },
    { label: "Photo and image requests", href: "/services/photo-image-requests" },
    { label: "Google Q&A management", href: "/services/qa-management" },
    { label: "Local SEO checklist", href: "/learn/local-seo-checklist" },
  ],
  "gbp-audits": [
    { label: "Google Business Profile management", href: "/services/google-business-profile" },
    { label: "Local website SEO audits", href: "/services/local-website-seo-audits" },
    { label: "Local SEO checklist", href: "/learn/local-seo-checklist" },
  ],
  "review-management": [
    { label: "Multi-source review monitoring", href: "/services/review-monitoring" },
    { label: "Why reviews matter", href: "/learn/why-reviews-matter" },
    { label: "Lead recovery", href: "/services/lead-recovery" },
  ],
  "review-monitoring": [
    { label: "Review management", href: "/services/review-management" },
    { label: "Reporting dashboard", href: "/services/reporting" },
    { label: "Why reviews matter", href: "/learn/why-reviews-matter" },
  ],
  "citation-management": [
    { label: "What are citations?", href: "/learn/what-are-citations" },
    { label: "Local SEO checklist", href: "/learn/local-seo-checklist" },
    { label: "Platform overview", href: "/platform" },
  ],
  "local-rank-tracking": [
    { label: "What is the Google Map Pack?", href: "/learn/google-map-pack" },
    { label: "Competitor monitoring", href: "/services/competitor-monitoring" },
    { label: "Reporting dashboard", href: "/services/reporting" },
  ],
  "competitor-monitoring": [
    { label: "Local rank tracking", href: "/services/local-rank-tracking" },
    { label: "Review management", href: "/services/review-management" },
    { label: "Google Business Profile management", href: "/services/google-business-profile" },
  ],
  "local-website-seo-audits": [
    { label: "What is local SEO?", href: "/learn/what-is-local-seo" },
    { label: "Local SEO checklist", href: "/learn/local-seo-checklist" },
    { label: "Platform overview", href: "/platform" },
  ],
  "photo-image-requests": [
    { label: "GBP posting and content", href: "/services/gbp-posting" },
    { label: "Google Business Profile management", href: "/services/google-business-profile" },
    { label: "Review management", href: "/services/review-management" },
  ],
  "qa-management": [
    { label: "Google Business Profile management", href: "/services/google-business-profile" },
    { label: "Local SEO checklist", href: "/learn/local-seo-checklist" },
    { label: "FAQ", href: "/faq" },
  ],
  "lead-recovery": [
    { label: "Platform overview", href: "/platform" },
    { label: "Review management", href: "/services/review-management" },
    { label: "Reporting dashboard", href: "/services/reporting" },
    { label: "Pricing", href: "/pricing" },
  ],
  reporting: [
    { label: "Platform overview", href: "/platform" },
    { label: "Local rank tracking", href: "/services/local-rank-tracking" },
    { label: "Review management", href: "/services/review-management" },
    { label: "Citation management", href: "/services/citation-management" },
  ],
};

export const learnFaqs: Record<string, FAQItem[]> = {
  "what-is-local-seo": [
    {
      question: "What is local SEO in simple terms?",
      answer:
        "Local SEO is the work of helping nearby customers find, trust, and contact your business through Google, maps, reviews, listings, local pages, and consistent business information.",
    },
    {
      question: "What are examples of local searches?",
      answer:
        "Examples include plumber near me, roof repair in my city, med spa consultation, emergency HVAC service, dentist near me, and auto detailer nearby.",
    },
    {
      question: "What should a local business improve first?",
      answer:
        "Start with accurate Google Business Profile details, clear services, recent reviews, consistent listings, useful photos, and a website that makes calling easy.",
    },
  ],
  "google-map-pack": [
    {
      question: "What is the Google Map Pack?",
      answer:
        "The Google Map Pack is the map and short list of local businesses that Google shows for many nearby service searches.",
    },
    {
      question: "Can a business guarantee Map Pack rankings?",
      answer:
        "No. Map Pack visibility depends on many factors, including relevance, distance, competition, reviews, profile quality, and trust signals.",
    },
  ],
  "google-business-profile": [
    {
      question: "Is a Google Business Profile free?",
      answer:
        "Creating a Google Business Profile is generally free, but keeping it accurate, active, and useful still takes ongoing attention.",
    },
    {
      question: "What belongs on a Google Business Profile?",
      answer:
        "Important elements include name, address, phone, hours, service areas, categories, services, description, photos, posts, Q&A, reviews, and website links.",
    },
  ],
  "why-reviews-matter": [
    {
      question: "Do reviews help local SEO?",
      answer:
        "Reviews can support local trust and visibility signals, but they also matter because real customers use them to decide who to call.",
    },
    {
      question: "Should a business respond to reviews?",
      answer:
        "Yes. Thoughtful responses show future customers that the business pays attention, appreciates feedback, and handles concerns professionally.",
    },
  ],
  "what-are-citations": [
    {
      question: "What does NAP consistency mean?",
      answer:
        "NAP consistency means your business name, address, and phone number match across Google, maps, directories, social profiles, and local listing sites.",
    },
    {
      question: "Why do citations matter?",
      answer:
        "Citations help customers find correct business information and reduce confusion caused by old addresses, wrong phone numbers, or mismatched names.",
    },
  ],
  "local-seo-checklist": [
    {
      question: "How often should I review a local SEO checklist?",
      answer:
        "Review the basics monthly or any time your hours, services, phone number, location, website, or business policies change.",
    },
    {
      question: "Can a checklist replace local SEO software?",
      answer:
        "A checklist helps you see the work. Software helps monitor, remind, organize, automate, and report on that work over time.",
    },
  ],
  "local-seo-for-service-businesses": [
    {
      question: "Why is local SEO different for service businesses?",
      answer:
        "Service businesses need to explain what they do, where they serve, how quickly they respond, and why customers should trust them before booking or calling.",
    },
    {
      question: "Which industries can use local SEO?",
      answer:
        "Contractors, HVAC companies, plumbers, roofers, landscapers, cleaners, med spas, salons, dentists, auto repair shops, and professional services can all benefit.",
    },
  ],
};

export const learnRelatedLinks: Record<string, RelatedLink[]> = {
  "what-is-local-seo": [
    { label: "Google Map Pack guide", href: "/learn/google-map-pack" },
    { label: "Google Business Profile guide", href: "/learn/google-business-profile" },
    { label: "Citation basics", href: "/learn/what-are-citations" },
    { label: "Local SEO checklist", href: "/learn/local-seo-checklist" },
  ],
  "google-map-pack": [
    { label: "Local rank tracking", href: "/services/local-rank-tracking" },
    { label: "Google Business Profile management", href: "/services/google-business-profile" },
  ],
  "google-business-profile": [
    { label: "Google Business Profile management", href: "/services/google-business-profile" },
    { label: "GBP posting", href: "/services/gbp-posting" },
    { label: "GBP Q&A", href: "/services/qa-management" },
  ],
  "why-reviews-matter": [
    { label: "Review management", href: "/services/review-management" },
    { label: "Review monitoring", href: "/services/review-monitoring" },
  ],
  "what-are-citations": [
    { label: "Citation management", href: "/services/citation-management" },
    { label: "Local SEO checklist", href: "/learn/local-seo-checklist" },
  ],
  "local-seo-checklist": [
    { label: "Google Business Profile management", href: "/services/google-business-profile" },
    { label: "Review management", href: "/services/review-management" },
    { label: "Citation management", href: "/services/citation-management" },
    { label: "Lead recovery", href: "/services/lead-recovery" },
  ],
  "local-seo-for-service-businesses": [
    { label: "Website SEO audits", href: "/services/local-website-seo-audits" },
    { label: "Local rank tracking", href: "/services/local-rank-tracking" },
    { label: "Lead recovery", href: "/services/lead-recovery" },
  ],
};

export const faqGroups: { heading: string; items: FAQItem[] }[] = [
  {
    heading: "General",
    items: [
      {
        question: "Do I need to understand SEO to use Visora?",
        answer:
          "No. The platform is built for business owners who want clear next steps, not technical jargon. You can go deeper if you want, but you do not need to become an SEO expert.",
      },
      {
        question: "Is Visora an agency or software?",
        answer:
          "Visora is software designed to keep local visibility, reputation, listings, reporting, and lead recovery organized. It can support an agency-style workflow, but the platform itself is the center.",
      },
    ],
  },
  {
    heading: "Local SEO basics",
    items: [
      {
        question: "Do you guarantee rankings?",
        answer:
          "No. Nobody should promise guaranteed number one rankings. Visora helps improve the signals, consistency, activity, and follow-up that support stronger local visibility over time.",
      },
      {
        question: "How fast will I see results?",
        answer:
          "Some fixes are visible quickly, like corrected hours or better profile content. Ranking, review, and citation improvements usually take time and depend on competition, location, history, and activity.",
      },
    ],
  },
  {
    heading: "Google Business Profile",
    items: [
      {
        question: "What does GBP mean?",
        answer:
          "GBP means Google Business Profile. It is the listing for your business on Google Search and Maps.",
      },
      {
        question: "Can I keep control of my profile?",
        answer:
          "Yes. Where integrations are enabled, the platform is designed to help organize, draft, monitor, and recommend. Important business decisions can stay in the owner's control.",
      },
    ],
  },
  {
    heading: "Reviews",
    items: [
      {
        question: "Can review replies be approved first?",
        answer:
          "Yes, workflows can keep owner or admin approval in the loop, especially for sensitive or negative reviews.",
      },
      {
        question: "Does the platform only monitor Google reviews?",
        answer:
          "Google is central for many local businesses, but multi-source monitoring can bring reviews from connected sources into one view where available.",
      },
    ],
  },
  {
    heading: "Citations and visibility",
    items: [
      {
        question: "What is NAP consistency?",
        answer:
          "NAP stands for name, address, and phone. Consistency means those details match across your online listings.",
      },
      {
        question: "Why can rankings differ by town?",
        answer:
          "Local results are influenced by relevance, distance, competition, and trust signals. You may be visible near your office but weaker in another nearby town.",
      },
    ],
  },
  {
    heading: "Lead Recovery",
    items: [
      {
        question: "Do I need to change my phone number?",
        answer:
          "Not necessarily. Option B allows you to keep your current phone number and forward missed or unanswered calls to a recovery number where that setup is enabled.",
      },
      {
        question: "What information can be collected from missed callers?",
        answer:
          "The workflow can collect the service needed, location, urgency, preferred time, name, and contact details, then send the owner a summary.",
      },
    ],
  },
  {
    heading: "Pricing and setup",
    items: [
      {
        question: "Can I keep my current website?",
        answer:
          "Yes. Visora can audit and monitor website basics without requiring a full rebuild. If a website needs deeper work, that can be handled separately.",
      },
      {
        question: "Can I cancel?",
        answer:
          "Subscription terms depend on the plan and agreement. The pricing page uses simple tiers and avoids long-term lock-in language unless it is part of a signed contract.",
      },
    ],
  },
  {
    heading: "Data and security",
    items: [
      {
        question: "Do you sell customer data?",
        answer:
          "No. The platform is designed to use customer and business data to provide the service, support users, maintain security, and operate necessary integrations.",
      },
      {
        question: "What third-party tools may be involved?",
        answer:
          "Depending on the enabled features, the platform may use Google APIs, Twilio, Stripe, Supabase, hosting providers, and analytics or logging tools.",
      },
    ],
  },
];

export const pricingPlans = [
  {
    name: "Presence",
    price: "Starting at $129/mo",
    description: "For businesses that need the basics managed and explained clearly.",
    features: ["GBP audit", "GBP posting", "Review requests", "Basic reporting", "Owner-friendly action list"],
    cta: "Book a demo",
    featured: false,
  },
  {
    name: "Visibility",
    price: "Starting at $249/mo",
    description: "For businesses that want stronger local presence, reputation, and consistency.",
    features: [
      "Everything in Presence",
      "Citation monitoring",
      "Local rank tracking",
      "Competitor visibility",
      "Image requests",
      "Q&A generation",
    ],
    cta: "Book a demo",
    featured: true,
  },
  {
    name: "Pro",
    price: "Book a demo",
    description: "For businesses that want visibility plus conversion help and lead recovery.",
    features: [
      "Everything in Visibility",
      "Missed call text-back",
      "Lead intake",
      "Owner alerts",
      "Lead inbox",
      "Advanced reporting",
    ],
    cta: "Talk through Pro",
    featured: false,
  },
];

export const industries = [
  "Contractors",
  "Med spas",
  "Salons",
  "Dentists",
  "Auto services",
  "Cleaners",
  "Landscapers",
  "Roofers",
  "HVAC companies",
  "Home service businesses",
];

export function getServicePage(slug: string) {
  return servicePages.find((page) => page.slug === slug);
}

export function getLearnPage(slug: string) {
  return learnPages.find((page) => page.slug === slug);
}

export function getServiceFaqs(slug: string) {
  return serviceFaqs[slug] ?? [];
}

export function getLearnFaqs(slug: string) {
  return learnFaqs[slug] ?? [];
}

export function getServiceRelatedLinks(slug: string) {
  return serviceRelatedLinks[slug] ?? [];
}

export function getLearnRelatedLinks(slug: string) {
  return learnRelatedLinks[slug] ?? [];
}
