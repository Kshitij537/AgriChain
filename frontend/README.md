# AgriChain  - Frontend

A modern, responsive React application for AI-powered precision agriculture platform.

## Features

- **Landing Page**: Beautiful hero section with feature showcase, workflow explanation, and call-to-action
- **Dashboard**: Real-time farm monitoring with metrics and alerts
- **Farm Setup**: Geofencing and property configuration
- **Disease Detection**: AI-powered crop disease identification from images
- **Spoilage Risk**: Post-harvest storage condition monitoring and predictions
- **Market Insights**: Global commodity price tracking and supply chain analysis
- **User Management**: Profile management and subscription handling
- **Authentication**: Login and registration pages

## Tech Stack

- **Framework**: React 18
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Routing**: React Router
- **Icons**: Material Symbols
- **HTTP Client**: Axios

## Getting Started

### Prerequisites

- Node.js 16+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Install missing dependencies if needed
npm install -D tailwindcss postcss autoprefixer @tailwindcss/forms
npm install react-router-dom axios
```

### Development

```bash
# Start development server (runs on http://localhost:3000)
npm run dev
```

### Build

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── Navbar.jsx
│   ├── HeroSection.jsx
│   ├── FeatureCard.jsx
│   ├── EcosystemSection.jsx
│   ├── WorkflowSection.jsx
│   ├── DashboardSection.jsx
│   ├── StatsSection.jsx
│   ├── CtaSection.jsx
│   └── Footer.jsx
├── pages/              # Page components
│   ├── Landing.jsx
│   ├── Dashboard.jsx
│   ├── FarmSetup.jsx
│   ├── DiseaseDetection.jsx
│   ├── SpoilageRisk.jsx
│   ├── Market.jsx
│   ├── FarmView.jsx
│   ├── Profile.jsx
│   ├── Login.jsx
│   └── Register.jsx
├── styles/
│   └── tailwind.css    # Tailwind CSS and custom styles
├── App.jsx             # Main app component with routing
└── main.jsx            # Entry point
```

## Design System

### Color Palette
- **Primary**: #00311f (Dark green)
- **Secondary**: #2b5bb5 (Blue)
- **Tertiary**: #002e3e (Dark teal)
- **Surface**: #fafaf5 (Light background)

### Typography
- **Headlines**: Manrope (400, 600, 700, 800 weights)
- **Body/Labels**: Inter (400, 500, 600 weights)

### Components
- **Glass Cards**: Semi-transparent cards with backdrop blur
- **Gradients**: Primary gradient from dark green to blue
- **Icons**: Material Symbols (outlined, 24px)

## API Integration

The app is configured to proxy API requests to the backend:

```javascript
// In vite.config.js
proxy: {
  '/api': {
    target: 'http://localhost:5001',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, '')
  }
}
```

Example usage with Axios:
```javascript
import axios from 'axios';

// API calls automatically proxy to localhost:5001
const response = await axios.get('/api/farms');
```

## Responsive Breakpoints

- Mobile: < 768px
- Tablet: 768px - 1024px
- Desktop: > 1024px

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Performance Optimization

- Code splitting with React Router
- Image lazy loading
- Tailwind CSS purging unused styles
- Vite fast refresh for development

## Contributing

Follow these guidelines when adding new components:

1. Use Tailwind CSS for styling
2. Follow the existing component structure
3. Use Material Symbols for icons
4. Maintain responsive design
5. Keep components modular and reusable

## License

MIT
