import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'missiAI',
    short_name: 'missi',
    description: 'Voice AI assistant that remembers you.',
    start_url: '/',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      {
        src: '/images/logo-symbol.png',
        sizes: 'any',
        type: 'image/png',
      },
    ],
  }
}
