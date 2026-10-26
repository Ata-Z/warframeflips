// Row shapes for the Supabase tables, matching what warframe.py, sets.py and arcanes.py write

export interface ModPrice {
  mod: string;
  seller_price: number | null;
  buyer_price: number | null;
  profit: number | null;
  seller_count: number;
  buyer_count: number;
  updated_at: string;
}

export interface SetPart {
  slug: string;
  name: string;
  qty: number;
  sell: number | null;
  buy: number | null;
}

export interface SetPrice {
  set_slug: string;
  set_name: string;
  set_sell: number | null;
  set_buy: number | null;
  parts_sell_total: number | null;
  parts_buy_total: number | null;
  assemble_profit: number | null;
  break_profit: number | null;
  parts: SetPart[];
  updated_at: string;
}

export interface ArcanePlanEntry {
  rank: number;
  platinum: number;
  qty: number;
  seller: string;
}

export interface ArcaneRank {
  rank: number;
  buy_cost: number | null;
  sell_price: number | null;
  buyers: number;
  profit: number | null;
}

export interface ArcanePrice {
  arcane_slug: string;
  arcane_name: string;
  max_rank: number;
  target_rank: number | null;
  buy_cost: number | null;
  sell_price: number | null;
  profit: number | null;
  trades: number | null;
  plan: ArcanePlanEntry[] | null;
  ranks: ArcaneRank[] | null;
  updated_at: string;
}

// Postgres numeric columns can arrive as strings, so the chart code runs them through Number()
type Numeric = number | string | null;

export interface HistoryBucket {
  bucket: string;
  avg_profit: Numeric;
  avg_seller_price: Numeric;
  avg_buyer_price: Numeric;
  avg_seller_count?: Numeric;
  avg_buyer_count?: Numeric;
  min_profit?: Numeric;
  max_profit?: Numeric;
  samples: number;
}

export interface Profile {
  username: string;
  avatar_url: string | null;
}

export interface ThreadSummary {
  id: number;
  title: string;
  reply_count: number;
  created_at: string;
  last_post_at: string;
  author: Profile | null;
}

export interface Post {
  id: number;
  body: string;
  author_id: string;
  created_at: string;
  author: Profile | null;
}

export interface ThreadDetail extends Post {
  title: string;
}
