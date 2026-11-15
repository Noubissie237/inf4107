// Load test: each virtual user logs in ONCE with a random seeded student, then keeps reading
// its grades (one read per second), like a real user. The JWT is reused until it is refused.
//
//   k6 run -e BASE_URL=https://20u2671.inf4107.site -e PASSWORD=... loadtest/k6.js
//
// Parameters (-e NAME=value): BASE_URL (default http://localhost:8080), PASSWORD (required),
// STUDENTS = number of seeded students (default 2000, matricules 20u0001...20u<STUDENTS>).
import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = (__ENV.BASE_URL || "http://localhost:8080").replace(/\/$/, "");
const PASSWORD = __ENV.PASSWORD;
const STUDENTS = parseInt(__ENV.STUDENTS || "2000", 10);

export const options = {
  stages: [
    { duration: "2m", target: 200 }, // ramp up to 200 virtual users
    { duration: "3m", target: 200 }, // hold
  ],
  thresholds: {
    http_req_duration: ["p(95)<800"],
    http_req_failed: ["rate<0.01"],
  },
};

export function setup() {
  if (!PASSWORD) {
    throw new Error("PASSWORD is required: k6 run -e PASSWORD=... loadtest/k6.js");
  }
}

function randomMatricule() {
  const n = 1 + Math.floor(Math.random() * STUDENTS);
  return "20u" + String(n).padStart(4, "0");
}

// Per-VU state (each virtual user has its own copy of these variables)
let matricule = null;
let token = null;

function login() {
  matricule = matricule || randomMatricule();
  const response = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ matricule, password: PASSWORD }),
    { headers: { "Content-Type": "application/json" }, tags: { name: "login" } },
  );
  const ok = check(response, { "login 200": (r) => r.status === 200 });
  token = ok ? response.json("access_token") : null;
}

export default function () {
  if (!token) {
    login();
    if (!token) {
      sleep(1);
      return;
    }
  }

  const grades = http.get(`${BASE_URL}/api/grades/me/grades?semester=S1`, {
    headers: { Authorization: `Bearer ${token}` },
    tags: { name: "grades" },
  });
  check(grades, {
    "grades 200": (r) => r.status === 200,
    "grades has courses": (r) => r.status === 200 && r.json("courses").length > 0,
  });
  if (grades.status === 401) {
    token = null; // expired token: log in again on the next iteration
  }
  sleep(1);
}
