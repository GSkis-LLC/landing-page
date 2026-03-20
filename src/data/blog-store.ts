export interface BlogPost {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  author: string;
  date: string;
  keywords: string;
  ogImage: string;
  body: string;
}

type GlobModule = { default: BlogPost };

const blogModules = import.meta.glob('./blog/*.json', { eager: true }) as Record<string, GlobModule>;

const posts: BlogPost[] = [];

for (const [, mod] of Object.entries(blogModules)) {
  posts.push(mod.default);
}

// Sort by date descending (newest first)
posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

export function getAllPosts(): BlogPost[] {
  return posts;
}

export function getPostBySlug(slug: string): BlogPost | undefined {
  return posts.find((p) => p.slug === slug);
}
