import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';

interface ProcessSpec {
  name: string;
  command: string;
  args: string[];
  color: string;
}

const RESET = '\x1b[0m';
const SPECS: ProcessSpec[] = [
  { name: 'docs', command: 'npm', args: ['run', 'docs:dev'], color: '\x1b[36m' },
  { name: 'bridge', command: 'npm', args: ['run', 'review-bridge'], color: '\x1b[35m' }
];

const labelWidth = Math.max(...SPECS.map((spec) => spec.name.length));
const children: ChildProcess[] = [];
let shuttingDown = false;

for (const spec of SPECS) {
  const child = spawn(spec.command, spec.args, {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: process.platform === 'win32'
  });
  const prefix = `${spec.color}[${spec.name.padStart(labelWidth)}]${RESET} `;

  pipeWithPrefix(child.stdout, prefix);
  pipeWithPrefix(child.stderr, prefix);

  child.on('exit', (code, signal) => {
    const reason = signal ? `signal ${signal}` : `exit ${code}`;
    process.stdout.write(`${prefix}process ended (${reason})\n`);
    if (!shuttingDown) {
      shutdown(typeof code === 'number' && code !== 0 ? code : 1);
    }
  });

  children.push(child);
}

function pipeWithPrefix(stream: NodeJS.ReadableStream | null, prefix: string): void {
  if (!stream) {
    return;
  }
  const reader = createInterface({ input: stream });
  reader.on('line', (line) => {
    process.stdout.write(`${prefix}${line}\n`);
  });
}

function shutdown(exitCode: number): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  process.exitCode = exitCode;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
    }
  }
  setTimeout(() => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }
  }, 4000).unref();
}

process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));
