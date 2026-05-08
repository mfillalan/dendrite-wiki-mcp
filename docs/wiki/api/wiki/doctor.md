---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/doctor.ts
---

# `src/wiki/doctor.ts`

`dendrite-wiki doctor` — project-health audit.

Aggregates findings from every health-relevant subsystem into one ranked list with
severities (`critical`, `warning`, `info`): missing required files, stale benchmark
snapshots, accumulated wiki lint findings, contested or unsupported memories, missing
telemetry config when sharing is opt-in, etc. The CLI prints a human report by default
and a structured `--json` output for scripted health checks.

The doctor exits 1 on any `critical` finding so it integrates cleanly with CI gates and
pre-commit hooks. Most findings are advisory and live as `warning` so the doctor stays
useful without becoming a nag.

## Exports

- [`DoctorSeverity`](#doctorseverity) — type alias
- [`DoctorFinding`](#doctorfinding) — interface
- [`DoctorReport`](#doctorreport) — interface
- [`runDoctor`](#rundoctor) — function
- [`formatDoctorReport`](#formatdoctorreport) — function

---

### `DoctorSeverity`

**Kind:** type alias · **Source:** [src/wiki/doctor.ts:21](../../../../src/wiki/doctor.ts#L21)

```ts
type DoctorSeverity = 'critical' | 'warning' | 'info'
```

---

### `DoctorFinding`

**Kind:** interface · **Source:** [src/wiki/doctor.ts:23](../../../../src/wiki/doctor.ts#L23)

```ts
interface DoctorFinding {
    severity: DoctorSeverity;
    rule: string;
    title: string;
    detail: string;
    fix?: string;
}
```

---

### `DoctorReport`

**Kind:** interface · **Source:** [src/wiki/doctor.ts:31](../../../../src/wiki/doctor.ts#L31)

```ts
interface DoctorReport {
    generatedAt: string;
    root: string;
    findings: DoctorFinding[];
    counts: {
        critical: number;
        warning: number;
        info: number;
    };
    status: 'healthy' | 'warnings' | 'critical';
}
```

---

### `runDoctor`

**Kind:** function · **Source:** [src/wiki/doctor.ts:43](../../../../src/wiki/doctor.ts#L43)

```ts
function runDoctor(options: {
    root?: string;
}): Promise<DoctorReport>
```

---

### `formatDoctorReport`

**Kind:** function · **Source:** [src/wiki/doctor.ts:217](../../../../src/wiki/doctor.ts#L217)

```ts
function formatDoctorReport(report: DoctorReport): string
```
