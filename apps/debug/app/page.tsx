import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>Browser Debug</h1>
      <p>Test pages for the browser server API.</p>
      <ul>
        <li>
          <Link href="/start">Start</Link> — launch a browser and see the raw
          response
        </li>
        <li>
          <Link href="/connect">Connect</Link> — paste a debugger URL to view
          and control a running browser
        </li>
        <li>
          <Link href="/stop">Stop</Link> — stop a browser by id
        </li>
        <li>
          <Link href="/recording">Recording</Link> — fetch and play a
          session&apos;s S3 recording by id
        </li>
      </ul>
    </main>
  );
}
