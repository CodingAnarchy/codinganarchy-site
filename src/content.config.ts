import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { localMidnightIfDateOnly } from './lib/dates';

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    name: z.string(),
    tagline: z.string(),
    language: z.string(),
    status: z.enum(['active', 'experimental', 'stable', 'archived']),
    repo: z.url(),
    links: z.array(z.object({ label: z.string(), url: z.url() })).default([]),
    // Lower numbers sort first on the home and projects pages.
    order: z.number().default(100),
  }),
});

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date().transform(localMidnightIfDateOnly),
    updated: z.coerce.date().transform(localMidnightIfDateOnly).optional(),
    tags: z.array(z.string()).default([]),
    project: reference('projects').optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { projects, posts };
