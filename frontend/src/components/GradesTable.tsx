import type { CourseGrades } from "@/lib/api";
import { ABSENT, formatGrade } from "@/lib/format";

function Grade({ value, strong = false }: { value: number | null; strong?: boolean }) {
  if (value === null) {
    return (
      <>
        <span aria-hidden="true">{ABSENT}</span>
        <span className="sr-only">Note absente</span>
      </>
    );
  }
  if (!strong) return <span>{formatGrade(value)}</span>;
  // The average gets a coloured badge: green from 10/20, red below
  const tone = value >= 10 ? "bg-success-soft text-success" : "bg-danger-soft text-danger";
  return (
    <span className={`inline-block min-w-14 rounded-full px-2.5 py-0.5 font-semibold ${tone}`}>
      {formatGrade(value)}
    </span>
  );
}

const head = "px-5 py-3 font-semibold";
const numberHead = `${head} text-right`;
const number = "px-5 py-3.5 text-right tabular-nums";

export function GradesTable({ courses, semester }: { courses: CourseGrades[]; semester: string }) {
  return (
    <div className="relative overflow-x-auto rounded-card border border-line bg-surface shadow-card">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <caption className="sr-only">Notes du semestre {semester}</caption>
        <thead>
          <tr className="border-b border-line bg-page text-left text-xs uppercase tracking-wider text-muted">
            <th scope="col" className={head}>
              Code
            </th>
            <th scope="col" className={head}>
              Matière
            </th>
            <th scope="col" className={numberHead}>
              Crédits
            </th>
            <th scope="col" className={numberHead}>
              CC
            </th>
            <th scope="col" className={numberHead}>
              TP
            </th>
            <th scope="col" className={numberHead}>
              SN
            </th>
            <th scope="col" className={numberHead}>
              Moyenne
            </th>
          </tr>
        </thead>
        <tbody>
          {courses.map((course) => (
            <tr key={course.code} className="border-b border-line transition-colors last:border-b-0 hover:bg-page/70">
              <th scope="row" className="px-5 py-3.5 text-left font-semibold text-accent">
                {course.code}
              </th>
              <td className="px-5 py-3.5">{course.title}</td>
              <td className={number}>{course.credits}</td>
              <td className={number}>
                <Grade value={course.cc} />
              </td>
              <td className={number}>
                <Grade value={course.tp} />
              </td>
              <td className={number}>
                <Grade value={course.sn} />
              </td>
              <td className={number}>
                <Grade value={course.average} strong />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
