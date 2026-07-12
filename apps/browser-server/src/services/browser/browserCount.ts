import { sessions } from "@/lib/browsers";

export function browserCount(): number {
  return sessions.size;
}
