import React from "react";
import { useResume } from "@/store/ResumeContext";

export function ResumePreview() {
  const { resume } = useResume();

  return (
    <div className="bg-white shadow-xl rounded-sm p-10 min-h-[1056px] text-[11px] leading-relaxed text-gray-900 font-sans border" style={{ fontFamily: "Arial, sans-serif" }}>
      {/* Header */}
      <header className="text-center mb-6 border-b-2 border-gray-800 pb-4">
        <h1 className="text-3xl font-bold tracking-wider mb-1 uppercase">{resume.name}</h1>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-widest mb-3">{resume.title}</h2>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-gray-600 text-xs">
          {resume.location && <span>{resume.location}</span>}
          {resume.phone && (
            <>
              <span className="text-gray-400">|</span>
              <span>{resume.phone}</span>
            </>
          )}
          {resume.email && (
            <>
              <span className="text-gray-400">|</span>
              <span>{resume.email}</span>
            </>
          )}
          {resume.website && (
            <>
              <span className="text-gray-400">|</span>
              <span>{resume.website}</span>
            </>
          )}
          {resume.github && (
            <>
              <span className="text-gray-400">|</span>
              <span>{resume.github}</span>
            </>
          )}
        </div>
      </header>

      {/* Summary */}
      {resume.summary && (
        <section className="mb-5">
          <h3 className="text-sm font-bold uppercase border-b border-gray-300 pb-1 mb-2 text-gray-800">Professional Summary</h3>
          <p className="text-justify">{resume.summary}</p>
        </section>
      )}

      {/* Experience */}
      {resume.experience.length > 0 && (
        <section className="mb-5">
          <h3 className="text-sm font-bold uppercase border-b border-gray-300 pb-1 mb-3 text-gray-800">Professional Experience</h3>
          <div className="space-y-4">
            {resume.experience.map((exp) => (
              <div key={exp.id}>
                <div className="flex justify-between items-baseline mb-1">
                  <div className="font-bold text-[12px]">{exp.company}</div>
                  <div className="text-gray-600 italic">{exp.location}</div>
                </div>
                <div className="flex justify-between items-baseline mb-2">
                  <div className="italic font-medium">{exp.role}</div>
                  <div className="text-gray-600 whitespace-nowrap">{exp.duration}</div>
                </div>
                <ul className="list-disc pl-5 space-y-1">
                  {exp.bullets.filter(b => b.trim()).map((bullet, idx) => (
                    <li key={idx} className="pl-1">{bullet}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Projects */}
      {resume.projects && (
        <section className="mb-5">
          <h3 className="text-sm font-bold uppercase border-b border-gray-300 pb-1 mb-2 text-gray-800">Projects</h3>
          <p>{resume.projects}</p>
        </section>
      )}

      {/* Skills */}
      {resume.skills && (
        <section className="mb-5">
          <h3 className="text-sm font-bold uppercase border-b border-gray-300 pb-1 mb-2 text-gray-800">Skills & Expertise</h3>
          <p>{resume.skills}</p>
        </section>
      )}

      {/* Education */}
      {resume.education && (
        <section className="mb-5">
          <h3 className="text-sm font-bold uppercase border-b border-gray-300 pb-1 mb-2 text-gray-800">Education</h3>
          <p>{resume.education}</p>
        </section>
      )}
    </div>
  );
}
