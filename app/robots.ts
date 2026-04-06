import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://missi.space'

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/api/', '/chat/', '/setup/'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
