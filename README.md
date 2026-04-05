# RPM Generator - Kurikulum Merdeka

A powerful, AI-driven tool designed for Indonesian educators to generate comprehensive "Rencana Pembelajaran Mendalam" (RPM) or Modul Ajar based on the Kurikulum Merdeka.

## 🚀 Features

- **AI-Powered Suggestions**: Automatically suggests Chapters (Bab) and Topics based on Subject, Grade, and Level.
- **Multi-Topic Selection**: Choose multiple topics to cover in a single lesson plan using an intuitive chip-based interface.
- **Flexible Generation Modes**:
  - **Daily Mode**: Generate a focused lesson plan for a single meeting.
  - **Module Mode**: Generate a complete module for an entire chapter with multiple meetings (up to 20).
- **Comprehensive Appendices**: Optionally generate Teaching Materials (Materi Ajar), Student Worksheets (LKPD), and Assessments (Asesmen) with Answer Keys and Rubrics.
- **AI Image Integration**: Automatically inserts relevant educational illustrations into your documents.
- **Professional Export Options**:
  - **PDF**: High-quality PDF export with optimized layout for printing.
  - **Word (.doc & .docx)**: Editable Word documents with preserved formatting.
- **Profile Management**: Save your identity (Name, NIP, School, etc.) to your profile for quick generation.

## 🛠️ Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS
- **Icons**: Lucide React
- **AI**: Google Gemini API (gemini-3-flash-preview)
- **Backend/Database**: Firebase Firestore & Authentication
- **Export Libraries**: html2pdf.js, html-docx-js-typescript

## 📦 Installation

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up your environment variables in `.env`:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   GEMINI_API_KEY=your_gemini_api_key
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```

## 📄 License

This project is licensed under the MIT License.
