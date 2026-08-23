/**
 * Global Search Component
 * Command palette style search with Cmd+K shortcut
 */

import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Code, Server, Boxes, FileText, X, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSearchStore, SearchResultType } from '@/stores/searchStore';
import { Dialog, DialogContent } from './dialog';
import { Input } from './input';

// =============================================================================
// Icons Map
// =============================================================================

const typeIcons: Record<SearchResultType, React.ComponentType<{ className?: string }>> = {
  function: Code,
  vm: Server,
  bucket: Boxes,
  page: FileText,
  polaroid: Camera,
};

const typeColors: Record<SearchResultType, string> = {
  function: 'text-purple-500',
  vm: 'text-blue-500',
  bucket: 'text-green-500',
  page: 'text-gray-500',
  polaroid: 'text-orange-500',
};

// =============================================================================
// Search Result Item
// =============================================================================

interface SearchResultItemProps {
  result: {
    id: string;
    type: SearchResultType;
    title: string;
    description?: string;
    url: string;
  };
  isSelected: boolean;
  onClick: () => void;
}

function SearchResultItem({ result, isSelected, onClick }: SearchResultItemProps) {
  const Icon = typeIcons[result.type];
  
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors',
        isSelected
          ? 'bg-accent text-accent-foreground'
          : 'hover:bg-muted'
      )}
    >
      <Icon className={cn('h-5 w-5 flex-shrink-0', typeColors[result.type])} />
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{result.title}</p>
        {result.description && (
          <p className="text-sm text-muted-foreground truncate">{result.description}</p>
        )}
      </div>
      <span className="text-xs text-muted-foreground capitalize">{result.type}</span>
    </button>
  );
}

// =============================================================================
// Global Search Component
// =============================================================================

export function GlobalSearch() {
  const navigate = useNavigate();
  const inputRef = React.useRef<HTMLInputElement>(null);
  
  const {
    isOpen,
    query,
    results,
    selectedIndex,
    closeSearch,
    setQuery,
    selectNext,
    selectPrevious,
  } = useSearchStore();

  // Focus input when dialog opens
  React.useEffect(() => {
    if (isOpen) {
      // Small delay to ensure dialog is rendered
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [isOpen]);

  // Ensure Escape always closes on first press, regardless of focused element.
  React.useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeSearch();
      }
    };

    document.addEventListener('keydown', handleEscape, true);
    return () => document.removeEventListener('keydown', handleEscape, true);
  }, [isOpen, closeSearch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectNext();
        break;
      case 'ArrowUp':
        e.preventDefault();
        selectPrevious();
        break;
      case 'Enter':
        e.preventDefault();
        if (results[selectedIndex]) {
          navigate(results[selectedIndex].url);
          closeSearch();
        }
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        closeSearch();
        break;
    }
  };

  const handleSelect = (url: string) => {
    navigate(url);
    closeSearch();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeSearch()}>
      <DialogContent
        className="p-0 gap-0 max-w-lg [&_[data-slot='dialog-close']]:hidden"
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          closeSearch();
        }}
      >
        <div className="flex items-center border-b px-3">
          <Search className="h-5 w-5 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages, functions, VMs, storage..."
            className="flex-1 border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <button
            onClick={closeSearch}
            className="p-1 hover:bg-muted rounded"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        
        <div className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No results found for "{query}"
            </div>
          ) : (
            <div className="space-y-1">
              {results.map((result, index) => (
                <SearchResultItem
                  key={result.id}
                  result={result}
                  isSelected={index === selectedIndex}
                  onClick={() => handleSelect(result.url)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span>
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] ml-1">↓</kbd>
              <span className="ml-1">to navigate</span>
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">↵</kbd>
              <span className="ml-1">to select</span>
            </span>
          </div>
          <span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">esc</kbd>
            <span className="ml-1">to close</span>
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Search Trigger Button
// =============================================================================

export function SearchTrigger({ className }: { className?: string }) {
  const { openSearch } = useSearchStore();

  return (
    <button
      onClick={openSearch}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground',
        'border rounded-md bg-muted/50 hover:bg-muted transition-colors',
        className
      )}
    >
      <Search className="h-4 w-4" />
      <span>Search...</span>
      <kbd className="ml-auto px-1.5 py-0.5 bg-background border rounded text-[10px]">
        ⌘K
      </kbd>
    </button>
  );
}

// =============================================================================
// Global Keyboard Shortcut Hook
// =============================================================================

export function useGlobalSearchShortcut() {
  const { toggleSearch } = useSearchStore();

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K on Mac, Ctrl+K on Windows/Linux
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleSearch();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggleSearch]);
}

export default GlobalSearch;
