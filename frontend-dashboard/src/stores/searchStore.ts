/**
 * Global Search Store
 * Manages global search state and results
 */

import { create } from 'zustand';

// =============================================================================
// Types
// =============================================================================

export type SearchResultType = 'function' | 'vm' | 'bucket' | 'polaroid' | 'page';

export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  description?: string;
  url: string;
  icon?: string;
}

interface SearchState {
  isOpen: boolean;
  query: string;
  results: SearchResult[];
  isLoading: boolean;
  selectedIndex: number;
  
  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;
  setQuery: (query: string) => void;
  setResults: (results: SearchResult[]) => void;
  setLoading: (loading: boolean) => void;
  selectNext: () => void;
  selectPrevious: () => void;
  resetSelection: () => void;
}

// =============================================================================
// Static Pages for Search
// =============================================================================

export const staticPages: SearchResult[] = [
  { id: 'page-dashboard', type: 'page', title: 'Dashboard', description: 'Overview and statistics', url: '/' },
  { id: 'page-functions', type: 'page', title: 'Impuls', description: 'Manage serverless functions', url: '/functions' },
  { id: 'page-functions-new', type: 'page', title: 'Create Impuls Function', description: 'Create a new function', url: '/functions/new' },
  { id: 'page-vms', type: 'page', title: 'Izvor', description: 'Manage virtual machines', url: '/vms' },
  { id: 'page-vms-new', type: 'page', title: 'Create VM', description: 'Create a new virtual machine', url: '/vms/new' },
  { id: 'page-storage', type: 'page', title: 'Spomen', description: 'Manage storage buckets', url: '/storage' },
  { id: 'page-storage-new', type: 'page', title: 'Create Spomen Bucket', description: 'Create a new storage bucket', url: '/storage/new' },
  { id: 'page-photos', type: 'page', title: 'Polaroid', description: 'Manage photos and videos', url: '/photos' },
  { id: 'page-albums', type: 'page', title: 'Photo Albums', description: 'Manage photo albums', url: '/photos/albums' },
  { id: 'page-people', type: 'page', title: 'People', description: 'Face recognition and people', url: '/photos/people' },
  { id: 'page-photo-map', type: 'page', title: 'Photo Map', description: 'View photos on map', url: '/photos/map' },
  { id: 'page-photo-search', type: 'page', title: 'Photo Search', description: 'Search photos with AI', url: '/photos/search' },
  { id: 'page-photo-sharing', type: 'page', title: 'Photo Sharing', description: 'Manage shared links', url: '/photos/sharing' },
  { id: 'page-settings', type: 'page', title: 'Settings', description: 'Account settings', url: '/settings' },
  { id: 'page-profile', type: 'page', title: 'Profile', description: 'Manage your profile', url: '/settings/profile' },
  { id: 'page-activity', type: 'page', title: 'Activity Log', description: 'View recent activity', url: '/settings/activity' },
  { id: 'page-quota', type: 'page', title: 'Quota Usage', description: 'View resource usage', url: '/settings/quota' },
];

// =============================================================================
// Store
// =============================================================================

export const useSearchStore = create<SearchState>((set, get) => ({
  isOpen: false,
  query: '',
  results: [],
  isLoading: false,
  selectedIndex: 0,

  openSearch: () => {
    set({ isOpen: true, query: '', results: staticPages, selectedIndex: 0 });
  },

  closeSearch: () => {
    set({ isOpen: false, query: '', results: [], selectedIndex: 0 });
  },

  toggleSearch: () => {
    const { isOpen } = get();
    if (isOpen) {
      get().closeSearch();
    } else {
      get().openSearch();
    }
  },

  setQuery: (query) => {
    const filtered = query
      ? staticPages.filter(
          (page) =>
            page.title.toLowerCase().includes(query.toLowerCase()) ||
            page.description?.toLowerCase().includes(query.toLowerCase())
        )
      : staticPages;
    
    set({ query, results: filtered, selectedIndex: 0 });
  },

  setResults: (results) => {
    set({ results });
  },

  setLoading: (isLoading) => {
    set({ isLoading });
  },

  selectNext: () => {
    const { selectedIndex, results } = get();
    set({ selectedIndex: (selectedIndex + 1) % results.length });
  },

  selectPrevious: () => {
    const { selectedIndex, results } = get();
    set({ selectedIndex: selectedIndex === 0 ? results.length - 1 : selectedIndex - 1 });
  },

  resetSelection: () => {
    set({ selectedIndex: 0 });
  },
}));
