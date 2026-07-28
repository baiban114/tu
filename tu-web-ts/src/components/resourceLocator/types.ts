import type { ResourceExcerpt, ResourceItem } from '@/api/externalResource'

/** Selection from the resource-locator browse tree (item and optional marked excerpt). */
export interface ResourceLocatorSelection {
  item: ResourceItem
  excerpt: ResourceExcerpt | null
}
