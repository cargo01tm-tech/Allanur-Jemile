export const INITIAL_PERFUMES = [
  {
    id: 'p-1',
    name: 'Amouage Interlude',
    price: 1250,
    salePrice: 1090,
    soldCount: 48,
    volumeMl: 100,
    longevityHours: 24,
    imageUrl: 'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'p-2',
    name: 'Baccarat Rouge 540',
    price: 1400,
    salePrice: 1190,
    soldCount: 92,
    volumeMl: 70,
    longevityHours: 18,
    imageUrl: 'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'p-3',
    name: 'Chanel Coco Mademoiselle',
    price: 1120,
    salePrice: 980,
    soldCount: 65,
    volumeMl: 100,
    longevityHours: 12,
    imageUrl: 'https://images.unsplash.com/photo-1523293182086-7651a899d37f?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'p-4',
    name: 'Dior Sauvage Elixir',
    price: 1180,
    salePrice: 990,
    soldCount: 114,
    volumeMl: 60,
    longevityHours: 20,
    imageUrl: 'https://images.unsplash.com/photo-1588405748880-12d1d2a59f75?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'p-5',
    name: 'Tom Ford Oud Wood',
    price: 1350,
    salePrice: null,
    soldCount: 53,
    volumeMl: 100,
    longevityHours: 16,
    imageUrl: 'https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=800&q=80',
  },
].sort((a, b) => a.name.localeCompare(b.name, 'tk', { sensitivity: 'base' }));

export const ADMIN_PASSCODE = '050625';
export const DEFAULT_SYNC_URL = '';
export const DEFAULT_STORE_ROOM = 'allanur_jemile_store';
