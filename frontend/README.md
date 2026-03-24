# IM Project Frontend

Based on Vue 3 + TypeScript + Vite + Element Plus + Pinia.

## Project Structure

The project follows a modular structure:

- **`src/assets`**: Static assets (images, fonts, icons).
- **`src/components`**: Reusable UI components.
  - `layout`: Layout components (e.g., SideNavBar).
- **`src/hooks`**: Vue Composables (Custom Hooks) for logic reuse.
- **`src/pages`**: Page-level components corresponding to routes.
- **`src/services`**: API service layer, organized by domain (user, message, group, etc.).
- **`src/stores`**: Pinia state management modules.
- **`src/styles`**: Global styles, variables, and mixins (SCSS).
- **`src/types`**: TypeScript interface and type definitions.
- **`src/utils`**: Utility functions (request, auth, common helpers).

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```
