/**
 * SEO Configuration
 * Define meta tags for each page/route in your app.
 * This file is automatically used by the root layout to generate metadata.
 */

export interface SEOConfig {
  title: string;
  description: string;
  keywords?: string;
}

// Define SEO metadata for each route
export const seoConfig: Record<string, SEOConfig> = {
  '/': {
    title: 'Home',
    description: 'Welcome to our app',
    keywords: '',
  },
  // Add more routes as needed:
  // '/about': {
  //   title: 'About Us',
  //   description: 'Learn more about our company',
  //   keywords: 'about, company, team',
  // },
};

// Helper function to get SEO config for a route
export function getSEOConfig(pathname: string): SEOConfig {
  return seoConfig[pathname] || seoConfig['/'] || {
    title: 'Web App',
    description: 'Built with AppGen',
    keywords: '',
  };
}
