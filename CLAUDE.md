# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Commands
- `pnpm dev` - Start development servers for all apps (reader + website)
- `pnpm build` - Build all apps using Turborepo
- `pnpm lint` - Run linting across all packages

### Working with Individual Apps
- Reader app: `cd apps/reader && pnpm dev`
- Website: `cd apps/website && pnpm dev`

### Dependencies
- `pnpm i` - Install dependencies for entire monorepo
- Node.js >=18.0.0 required
- Uses pnpm workspaces with Turborepo for build orchestration

## Architecture Overview

### Monorepo Structure
- **apps/reader/** - Main ePub reader Next.js application
- **apps/website/** - Marketing/documentation site
- **packages/** - Shared packages including custom epub.js fork

### Reader App Architecture

#### State Management (Hybrid Approach)
- **Valtio** - Primary state for complex reader logic:
  - `Reader` class manages tab groups and navigation (state.ts)
  - `BookTab` class handles individual book instances
  - Complex operations: rendering, annotations, search
- **Recoil** - Simple UI state with localStorage persistence:
  - Settings, navigation, typography, themes

#### Key Classes and Structure
- **Reader/BookTab Pattern**: Tab-based multi-book architecture with drag-and-drop
- **Components Structure**:
  - `components/base/` - Reusable UI primitives
  - `components/viewlets/` - Specialized panels (TOC, Search, Annotations)
  - `components/pages/` - Settings and main interface
- **Hooks Organization**:
  - `hooks/remote/` - Dropbox sync functionality
  - `hooks/theme/` - Material Design 3 theming system

#### Data Layer
- **Dexie (IndexedDB)** for local storage (db.ts)
- Book files, metadata, reading progress, annotations
- Database migration system for schema updates
- Dropbox integration for cloud sync

#### ePub Rendering
- Custom fork of epub.js in packages/@flow/epubjs
- Iframe-based rendering with cross-frame communication  
- CFI (Canonical Fragment Identifier) for precise positioning
- Custom CSS injection for themes and typography

### Key Features Implementation
- **Annotations**: Color-coded highlights/notes with CFI positioning
- **Search**: Full-text search across books with highlighting
- **Typography**: Dynamic font configuration with theme integration
- **PWA**: Service worker, manifest, mobile optimization
- **I18n**: Multi-language support (EN, CN, JP) in locales/

## Development Notes

### TypeScript Configuration
- Strict TypeScript with path mapping configured
- Multiple tsconfig files for different environments
- React/Next.js specific configurations

### Environment Setup
- Copy `.env.local.example` files to `.env.local` in app directories
- Environment variables required for cloud storage integration

### Testing and Quality
- ESLint + Prettier with pre-commit hooks via husky
- Lint-staged for staged file formatting
- Sentry integration for error monitoring

### Architecture Patterns
- Object-oriented reader models with class-based state
- Event-driven rendering pipeline
- Hook-based architecture for custom behaviors
- Modular component design with clear separation of concerns