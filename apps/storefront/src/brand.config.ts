export type Brand = {
  storeName: string
  tagline: string
  /** Short company blurb shown in the footer brand column */
  description: string
  logoPath: string
  faviconPath: string
  colors: {
    primary: string
    secondary: string
    background: string
    text: string
  }
  fonts: {
    heading: string
    body: string
  }
  contact: {
    address: string
    phone: string
    email: string
    whatsapp: string
  }
  /** Set any social URL to "" to hide that icon in the footer */
  social: {
    facebook: string
    instagram: string
    tiktok: string
    youtube: string
  }
}

const brand: Brand = {
  storeName: "BUNO HOME DECOR",
  tagline: "Quality Crafted Wooden products, delivered fast.",
  description:
    "Your go-to destination for quality home decoration items at great prices, delivered fast with care to your door.",

  // Place logo at /public/images/logo.svg and favicon at /public/favicon.ico
  logoPath: "/images/logo.svg",
  faviconPath: "/favicon.ico",

  colors: {
    primary: "#000000",
    secondary: "#6B7280",
    background: "#FFFFFF",
    text: "#111827",
  },

  // Any Google Fonts family name works here
  fonts: {
    heading: "Inter",
    body: "Inter",
  },

  contact: {
    address: "Banktown, Savar, Dhaka 1340, Bangladesh",
    phone: "+8801712345678",
    email: "bunohomedecor@gmail.com",
    whatsapp: "+8801349498525", // e.g. "+15551234567" — admin DB value takes precedence at runtime
  },

  social: {
    facebook: "https://facebook.com/bunohomedecor", // e.g. "https://facebook.com/mystore"
    instagram: "https://instagram.com/bunohomedecor", // e.g. "https://instagram.com/mystore"
    tiktok: "https://tiktok.com/@bunohomedecor", // e.g. "https://tiktok.com/@mystore"
    youtube: "https://youtube.com/@bunohomedecor", // e.g. "https://youtube.com/@mystore"
  },
}

export default brand
