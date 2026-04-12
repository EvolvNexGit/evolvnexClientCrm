# EvolvNex Client CRM

## Project Overview
EvolvNex Client CRM is a comprehensive customer relationship management platform designed to streamline interactions with customers, manage leads, and improve organizational efficiency.

## Features
- **Lead Management**: Track and manage customer leads through the sales pipeline
- **Contact Management**: Organize and maintain detailed customer information
- **Task & Activity Tracking**: Schedule tasks, log interactions, and set reminders
- **Dashboard & Reports**: Visualize key metrics and generate comprehensive reports
- **Email Integration**: Seamless email communication within the platform
- **User Management**: Role-based access control and team collaboration

## Tech Stack
- **Framework**: Next.js 15 (App Router)
- **Database & Auth**: Supabase
- **Styling**: Tailwind CSS
- **Language**: TypeScript

## Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Supabase account

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/EvolvNexGit/evolvnexClientCrm.git
   cd evolvnexClientCrm
   ```

2. Copy `.env.example` to `.env.local` and fill in your Supabase credentials:
   ```bash
   cp .env.example .env.local
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure
```
evolvnexClientCrm/
├── app/                 # Next.js app directory
│   ├── components/      # Reusable React components
│   ├── pages/          # Page components
│   └── api/            # API routes
├── public/             # Static assets
├── styles/             # Global styles
├── lib/                # Utility functions and helpers
├── .env.example        # Environment variables template
├── package.json        # Dependencies and scripts
└── tsconfig.json       # TypeScript configuration
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Contributing
We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch:
   ```bash
   git checkout -b feature/YourFeature
   ```
3. Commit your changes:
   ```bash
   git commit -m "Add your feature description"
   ```
4. Push to the branch:
   ```bash
   git push origin feature/YourFeature
   ```
5. Open a Pull Request

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support
For questions or issues, please open an issue on the [GitHub Issues page](https://github.com/EvolvNexGit/evolvnexClientCrm/issues).