import React, { createContext, useContext, useState } from "react";

export type Experience = {
  id: string;
  company: string;
  role: string;
  location: string;
  duration: string;
  bullets: string[];
};

export type Project = {
  id: string;
  name: string;
  description: string;
};

export type ResumeData = {
  name: string;
  location: string;
  phone: string;
  email: string;
  website: string;
  github: string;
  title: string;
  summary: string;
  experience: Experience[];
  projects: string; // Storing as a string block for simplicity in edit
  skills: string; // Storing as a string block
  education: string;
};

const defaultResume: ResumeData = {
  name: "ARAVIND",
  location: "Hamilton, New Zealand",
  phone: "+64 276369868",
  email: "aravindiaar@gmail.com",
  website: "aravindiaar.github.io",
  github: "nuget.org/profiles/Aravindiaar",
  title: "Senior Backend-Focused Fullstack Developer (.NET | Azure | Microservices)",
  summary: "Backend-focused fullstack developer with 9+ years of experience designing scalable APIs, cloud-based systems and automation platforms. Strong expertise in C#, .NET Core, microservices and DevOps, with hands-on experience in Azure, Docker and CI/CD pipelines. Work Rights: Eligible to work in New Zealand (No sponsorship required)",
  experience: [
    {
      id: "1",
      company: "MediMentor (NZ-based HealthTech Startup)",
      role: "Backend Developer",
      location: "Hamilton NZ",
      duration: "Jan 2026–Present",
      bullets: [
        "Built secure REST APIs using C# with JWT authentication and role-based access control",
        "Designed Postgres schemas and production-ready data models",
        "Deployed services to Microsoft Azure App Service using Docker (dev/prod environments)",
        "Set up environment configs, secrets and CI-friendly deployment structure"
      ]
    },
    {
      id: "2",
      company: "New Zealand Red Cross",
      role: "Volunteer – Charity Shop Assistant",
      location: "Hamilton NZ",
      duration: "Jan 2026–Present",
      bullets: [
        "Assisting with sorting, pricing and displaying donated items",
        "Providing customer service and helping customers in the shop"
      ]
    },
    {
      id: "3",
      company: "DSRC (Data Software & Research Company)",
      role: "Developer",
      location: "Chennai India",
      duration: "Mar 2016–Dec 2025",
      bullets: [
        "Intelligent Document AI Platform: Built RAG system using vector database, built scalable REST APIs with PostgreSQL backend, reduced manual document handling by ~60%",
        "SFC AI IVR Bot: Designed and deployed AI-powered IVR bot to automate inbound customer calls, integrated backend services for call routing and resolution tracking",
        "Optifarm: Led database migration ensuring zero data loss, optimized schema and queries, implemented monitoring for API reliability",
        "Enterprise Web Platforms: Improved backend performance, delivered end-to-end modules for HRMS/enterprise portals, integrated video recording in WPF applications using FFmpeg"
      ]
    }
  ],
  projects: "GenAI Document Assistant, Conversational AI IVR Bot, Compliance APIs Platform, Enterprise CMS, Zero-Downtime DB Migration",
  skills: "C#, .NET Core, ASP.NET Web API, RESTful Services, Node.js, Python, JavaScript, Azure DevOps, Docker, Jenkins, Git, PowerShell, Microsoft SQL Server, PostgreSQL, Redis, CI/CD, ETL Pipelines, API Monitoring, Performance Tuning",
  education: "Anna University-SMIT, Bachelor of Engineering in Computer Science, First Class, Chennai India, Sep 2011–Jul 2015"
};

type ResumeContextType = {
  resume: ResumeData;
  updateResume: (data: Partial<ResumeData>) => void;
  updateExperience: (id: string, data: Partial<Experience>) => void;
};

const ResumeContext = createContext<ResumeContextType | undefined>(undefined);

export function ResumeProvider({ children }: { children: React.ReactNode }) {
  const [resume, setResume] = useState<ResumeData>(defaultResume);

  const updateResume = (data: Partial<ResumeData>) => {
    setResume(prev => ({ ...prev, ...data }));
  };

  const updateExperience = (id: string, data: Partial<Experience>) => {
    setResume(prev => ({
      ...prev,
      experience: prev.experience.map(exp => exp.id === id ? { ...exp, ...data } : exp)
    }));
  };

  return (
    <ResumeContext.Provider value={{ resume, updateResume, updateExperience }}>
      {children}
    </ResumeContext.Provider>
  );
}

export function useResume() {
  const context = useContext(ResumeContext);
  if (!context) {
    throw new Error("useResume must be used within a ResumeProvider");
  }
  return context;
}
