import { getCollection } from 'astro:content';

export async function getProjects() {
  const projects = await getCollection('projects');
  return projects.sort((a, b) => a.data.order - b.data.order || a.data.name.localeCompare(b.data.name));
}

// Drafts render in `astro dev` so they can be previewed, and are left out of builds.
export async function getPosts() {
  const posts = await getCollection('posts', ({ data }) => import.meta.env.DEV || !data.draft);
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export { formatDate } from './dates';
