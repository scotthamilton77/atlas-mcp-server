# Portfolio Website Example

This directory contains a complete example of using Atlas MCP for planning and managing a modern portfolio website project. The example demonstrates how to structure complex web development tasks with proper dependencies, metadata, and organization.

## Contents

- `atlas-tasks.db`: SQLite database containing the task hierarchy and metadata
- `task-hierarchy-full.txt`: Human-readable tree view of all tasks and their relationships
- `task-hierarchy-full.json`: Detailed JSON export of all tasks with complete metadata
- `prompt.md`: Original prompt used to create this task structure

## Project Architecture

### Technology Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript with strict mode
- **Styling**: Tailwind CSS with custom configuration
- **Animation Libraries**:
  - Framer Motion for UI animations
  - GSAP for advanced animations
  - Three.js/React Three Fiber for 3D effects
- **Development Tools**:
  - ESLint with TypeScript rules
  - Prettier for code formatting
  - Husky for git hooks
  - Jest and Testing Library for testing

### Core Features

1. **Project Gallery**
   - Responsive masonry grid layout
   - Interactive project cards with 3D transforms
   - GitHub integration for real-time stats
   - Dynamic filtering and search
   - Infinite scroll support

2. **Hero Section**
   - Three.js particle system background
   - Mouse-reactive animations
   - Staggered text reveal effects
   - Scroll-aware navigation
   - Performance-optimized canvas

3. **Experience Timeline**
   - Clean, minimal timeline design
   - Interactive skill visualization
   - Animated achievement metrics
   - Responsive layout system
   - Intersection-based animations

4. **About & Contact**
   - Modern typography system
   - Form validation with React Hook Form
   - Social media integration
   - Minimal design aesthetic
   - Interactive elements

### Shared Components

1. **Interactive System**
   - Custom cursor effects
   - Particle system engine
   - Mouse position tracking
   - Force field interactions
   - Performance monitoring

2. **Animation Utilities**
   - Scroll-based animations
   - Spring physics system
   - Transition components
   - Loading states
   - RAF optimization

3. **UI Components**
   - Typography system with responsive scaling
   - Layout components (Container, Grid, Section)
   - Interactive elements (Button, Input, Card)
   - Navigation components
   - Animation primitives

### Performance Optimization

- Code splitting strategy
- Asset optimization pipeline
- Lazy loading implementation
- Performance monitoring
- Memory management
- FPS optimization

### Testing Implementation

1. **Unit Testing**
   - Component testing
   - Hook testing
   - Animation testing
   - Utility function testing

2. **Integration Testing**
   - Feature workflows
   - Form submissions
   - API integrations
   - Navigation flows

3. **Performance Testing**
   - Load time benchmarks
   - Animation performance
   - Memory profiling
   - Bundle analysis

4. **Visual Testing**
   - Component snapshots
   - Responsive layouts
   - Animation states
   - Theme variations

### Deployment Pipeline

- Automated CI/CD with GitHub Actions
- Preview deployments
- Production optimization
- Performance monitoring
- Error tracking
- Analytics integration

## Development Workflow

1. **Project Setup**
   ```bash
   npx create-next-app@latest portfolio --typescript --tailwind --app --src-dir
   ```

2. **Install Dependencies**
   ```bash
   # Core animation libraries
   npm install framer-motion gsap three @react-three/fiber @react-three/drei

   # Styling dependencies
   npm install -D tailwindcss postcss autoprefixer @tailwindcss/typography @tailwindcss/forms

   # Development tools
   npm install -D typescript @types/node @types/react @types/react-dom
   npm install -D eslint prettier husky lint-staged
   ```

3. **Directory Structure**
   ```
   src/
   ├── app/
   │   ├── layout.tsx
   │   └── page.tsx
   ├── components/
   │   ├── ui/
   │   ├── features/
   │   └── shared/
   ├── lib/
   │   ├── utils/
   │   ├── hooks/
   │   └── types/
   └── styles/
       └── globals.css
   ```

## Performance Targets

- First Contentful Paint (FCP): < 1000ms
- Largest Contentful Paint (LCP): < 2500ms
- First Input Delay (FID): < 100ms
- Cumulative Layout Shift (CLS): < 0.1
- Time to Interactive (TTI): < 3000ms

## Bundle Size Budgets

- JavaScript: 200KB
- Images: 500KB
- Total: 1MB

## Browser Support

- Modern evergreen browsers
- Progressive enhancement
- Fallback support for older browsers
