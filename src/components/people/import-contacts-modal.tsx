// src/components/people/import-contacts-modal.tsx
"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Upload,
  X,
} from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onImported?: () => void | Promise<void>;
};

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

type HeaderOption = {
  value: string;
  label: string;
};

type MappingMode = "full" | "split";
type AddressMappingMode = "full" | "split";
type RelationshipType = "CLIENT" | "PARTNER";
type ClientRole = "BUYER" | "SELLER" | "BOTH" | null;

type ParsedRow = Record<string, string>;

type PreviewRow = {
  rowIndex: number;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  duplicate: boolean;
  warnings: string[];
};

type ImportSummary = {
  totalRows: number;
  imported: number;
  skippedDuplicates: number;
  failed: number;
};

const NO_COLUMN = "__none__";
const MAX_IMPORT_ROWS = 1000;

function parseCsv(text: string): ParsedRow[] {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current);
      current = "";

      const hasSomeContent = row.some((cell) => cell.trim() !== "");
      if (hasSomeContent) rows.push(row);

      row = [];
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    const hasSomeContent = row.some((cell) => cell.trim() !== "");
    if (hasSomeContent) rows.push(row);
  }

  if (!rows.length) return [];

  const headers = rows[0].map((h, idx) =>
    idx === 0 ? h.replace(/^\uFEFF/, "").trim() : h.trim()
  );
  const body = rows.slice(1);

  return body.map((cells) => {
    const record: ParsedRow = {};
    headers.forEach((header, idx) => {
      record[header] = (cells[idx] ?? "").trim();
    });
    return record;
  });
}

function cleanString(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v ? v : null;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const v = cleanString(value);
  return v ? v.toLowerCase() : null;
}

function normalizePhone(value: string | null | undefined): string | null {
  const v = cleanString(value);
  if (!v) return null;
  const cleaned = v.replace(/[\s\-().]/g, "");
  return cleaned || null;
}

function splitFullName(fullName: string | null | undefined): {
  firstName: string | null;
  lastName: string | null;
} {
  const value = cleanString(fullName);
  if (!value) return { firstName: null, lastName: null };

  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null };
  }

  return {
    firstName: parts[0] ?? null,
    lastName: parts.slice(1).join(" ") || null,
  };
}

function buildNameFromSplit(
  firstName: string | null | undefined,
  lastName: string | null | undefined
) {
  return [cleanString(firstName), cleanString(lastName)]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function isLikelyValidEmail(value: string | null) {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getContactTypeLabel(
  relationshipType: RelationshipType,
  clientRole: ClientRole
) {
  if (relationshipType === "PARTNER") return "Partner";
  if (clientRole === "BUYER") return "Client • Buyer";
  if (clientRole === "SELLER") return "Client • Seller";
  if (clientRole === "BOTH") return "Client • Both";
  return "Client";
}

function stepLabel(step: Step) {
  switch (step) {
    case 1:
      return "Upload";
    case 2:
      return "Type";
    case 3:
      return "Name";
    case 4:
      return "Email";
    case 5:
      return "Phone";
    case 6:
      return "Address";
    case 7:
      return "Preview";
    default:
      return "";
  }
}

function normalizeSelectedColumns(columns: string[]) {
  return columns.map((value) => cleanString(value)).filter((value): value is string => !!value);
}

function buildJoinedAddress(row: ParsedRow, columns: string[]) {
  const parts = normalizeSelectedColumns(columns)
    .map((column) => cleanString(row[column]))
    .filter((value): value is string => !!value);

  if (!parts.length) return null;
  return parts.join(", ");
}

function guessAddressColumns(parsedHeaders: string[]): string[] {
  const lowerMap = new Map(parsedHeaders.map((header) => [header.toLowerCase(), header]));

  const singleColumnCandidates = [
    "property address",
    "full address",
    "mailing address",
    "address",
    "address 1",
  ];

  for (const key of singleColumnCandidates) {
    const match = lowerMap.get(key);
    if (match) return [match];
  }

  const orderedCandidates = [
    "property street",
    "property address 1",
    "address 1 - street",
    "street",
    "street address",
    "address line 1",
    "address1",
    "address 1",

    "address 1 - line 2",
    "unit",
    "apt",
    "suite",
    "address line 2",
    "address2",

    "property city",
    "address 1 - city",
    "city",

    "property state",
    "address 1 - state",
    "state",

    "property postal code",
    "property zip",
    "address 1 - zip",
    "zip",
    "postal code",

    "country",
  ];

  const results: string[] = [];
  for (const key of orderedCandidates) {
    const match = lowerMap.get(key);
    if (match && !results.includes(match)) {
      results.push(match);
    }
  }

  return results;
}

export default function ImportContactsModal({
  open,
  onClose,
  onImported,
}: Props) {
  const [step, setStep] = useState<Step>(1);

  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  const [mappingMode, setMappingMode] = useState<MappingMode>("full");
  const [fullNameColumn, setFullNameColumn] = useState("");
  const [firstNameColumn, setFirstNameColumn] = useState("");
  const [lastNameColumn, setLastNameColumn] = useState("");

  const [emailColumn, setEmailColumn] = useState(NO_COLUMN);
  const [phoneColumn, setPhoneColumn] = useState(NO_COLUMN);

  const [addressMappingMode, setAddressMappingMode] =
    useState<AddressMappingMode>("full");
  const [areasColumns, setAreasColumns] = useState<string[]>([]);

  const [relationshipType, setRelationshipType] =
    useState<RelationshipType>("CLIENT");
  const [clientRole, setClientRole] = useState<ClientRole>("BUYER");

  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

  const needsAddressStep =
    relationshipType === "CLIENT" &&
    (clientRole === "SELLER" || clientRole === "BOTH");

  const visibleSteps = useMemo(() => {
    const steps: Step[] = [1, 2, 3, 4, 5];
    if (needsAddressStep) steps.push(6);
    steps.push(7);
    return steps;
  }, [needsAddressStep]);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setFileName("");
      setHeaders([]);
      setRows([]);
      setParseError(null);
      setMappingMode("full");
      setFullNameColumn("");
      setFirstNameColumn("");
      setLastNameColumn("");
      setEmailColumn(NO_COLUMN);
      setPhoneColumn(NO_COLUMN);
      setAddressMappingMode("full");
      setAreasColumns([]);
      setRelationshipType("CLIENT");
      setClientRole("BUYER");
      setImporting(false);
      setImportError(null);
      setImportSummary(null);
    }
  }, [open]);

  useEffect(() => {
    if (!visibleSteps.includes(step)) {
      setStep(7);
    }
  }, [step, visibleSteps]);

  const headerOptions: HeaderOption[] = useMemo(
    () => headers.map((header) => ({ value: header, label: header })),
    [headers]
  );

  const previewRows: PreviewRow[] = useMemo(() => {
    return rows.slice(0, 10).map((row, idx) => {
      let name = "";
      if (mappingMode === "full") {
        name = cleanString(row[fullNameColumn]) ?? "";
      } else {
        name = buildNameFromSplit(row[firstNameColumn], row[lastNameColumn]);
      }

      const email =
        emailColumn === NO_COLUMN ? null : normalizeEmail(row[emailColumn]);

      const rawEmail =
        emailColumn === NO_COLUMN ? null : cleanString(row[emailColumn]);

      const phone =
        phoneColumn === NO_COLUMN ? null : normalizePhone(row[phoneColumn]);

      const address =
        needsAddressStep && areasColumns.length
          ? buildJoinedAddress(row, areasColumns)
          : null;

      const warnings: string[] = [];

      if (!email && !phone) {
        warnings.push("Missing email and phone");
      }

      if (rawEmail && email && !isLikelyValidEmail(email)) {
        warnings.push("Email format looks invalid");
      }

      if (needsAddressStep && !address) {
        warnings.push("Missing address");
      }

      return {
        rowIndex: idx + 1,
        name,
        email,
        phone,
        address,
        duplicate: false,
        warnings,
      };
    });
  }, [
    rows,
    mappingMode,
    fullNameColumn,
    firstNameColumn,
    lastNameColumn,
    emailColumn,
    phoneColumn,
    needsAddressStep,
    areasColumns,
  ]);

  const canGoNext = useMemo(() => {
    switch (step) {
      case 1:
        return rows.length > 0;
      case 2:
        return relationshipType === "PARTNER" || !!clientRole;
      case 3:
        return mappingMode === "full"
          ? !!fullNameColumn
          : !!firstNameColumn || !!lastNameColumn;
      case 4:
        return true;
      case 5:
        return emailColumn !== NO_COLUMN || phoneColumn !== NO_COLUMN;
      case 6:
        return addressMappingMode === "full"
          ? !!cleanString(getAreaColumnAt(0)) && getAreaColumnAt(0) !== NO_COLUMN
          : [
              getAreaColumnAt(0),
              getAreaColumnAt(1),
              getAreaColumnAt(2),
              getAreaColumnAt(3),
              getAreaColumnAt(4),
            ].some((column) => !!cleanString(column) && column !== NO_COLUMN);
      case 7:
        return true;
      default:
        return false;
    }
  }, [
        step,
        rows.length,
        relationshipType,
        clientRole,
        mappingMode,
        fullNameColumn,
        firstNameColumn,
        lastNameColumn,
        emailColumn,
        phoneColumn,
        addressMappingMode,
        areasColumns,
      ]);

  function handleNext() {
    if (!canGoNext) return;
    const currentIndex = visibleSteps.indexOf(step);
    const nextStep = visibleSteps[currentIndex + 1];
    if (nextStep) setStep(nextStep);
  }

  function handleBack() {
    const currentIndex = visibleSteps.indexOf(step);
    const previousStep = visibleSteps[currentIndex - 1];
    if (previousStep) {
      setStep(previousStep);
      return;
    }
    onClose();
  }

  function setAreaColumnAt(index: number, value: string) {
    setAreasColumns((prev) => {
      const next = [...prev];

      while (next.length <= index) {
        next.push(NO_COLUMN);
      }

      next[index] = value;

      while (next.length > 0 && next[next.length - 1] === NO_COLUMN) {
        next.pop();
      }

      return next;
    });
  }

  function getAreaColumnAt(index: number) {
    return areasColumns[index] ?? NO_COLUMN;
  }

  async function handleFileChange(file: File | null) {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setParseError("Please upload a .csv file.");
      setImportError(null);
      setImportSummary(null);
      setFileName("");
      setHeaders([]);
      setRows([]);
      setMappingMode("full");
      setFullNameColumn("");
      setFirstNameColumn("");
      setLastNameColumn("");
      setEmailColumn(NO_COLUMN);
      setPhoneColumn(NO_COLUMN);
      setAddressMappingMode("full");
      setAreasColumns([]);
      return;
    }

    try {
      setParseError(null);
      setImportError(null);
      setImportSummary(null);

      const text = await file.text();
      const parsedRows = parseCsv(text);

      if (!parsedRows.length) {
        throw new Error("This CSV appears to be empty.");
      }

      const parsedHeaders = Object.keys(parsedRows[0] ?? {});
      if (!parsedHeaders.length) {
        throw new Error("We couldn’t detect any CSV headers.");
      }

      setFileName(file.name);
      setHeaders(parsedHeaders);
      setRows(parsedRows);

      const lowerMap = new Map(
        parsedHeaders.map((header) => [header.toLowerCase(), header])
      );

      const guessedFullName =
        lowerMap.get("name") ||
        lowerMap.get("full name") ||
        lowerMap.get("contact name") ||
        "";

      const guessedFirstName =
        lowerMap.get("first name") || lowerMap.get("firstname") || "";

      const guessedLastName =
        lowerMap.get("last name") || lowerMap.get("lastname") || "";

      const guessedEmail =
        lowerMap.get("email") ||
        lowerMap.get("email 1") ||
        lowerMap.get("primary email") ||
        NO_COLUMN;

      const guessedPhone =
        lowerMap.get("phone") ||
        lowerMap.get("phone 1") ||
        lowerMap.get("mobile phone") ||
        lowerMap.get("mobile") ||
        NO_COLUMN;

      const guessedAreas = guessAddressColumns(parsedHeaders);

      if (guessedFirstName || guessedLastName) {
        setMappingMode("split");
        setFirstNameColumn(guessedFirstName);
        setLastNameColumn(guessedLastName);
      } else {
        setMappingMode("full");
        setFullNameColumn(guessedFullName);
      }

      setEmailColumn(guessedEmail);
      setPhoneColumn(guessedPhone);

      setAddressMappingMode(guessedAreas.length > 1 ? "split" : "full");
      setAreasColumns(guessedAreas);
    } catch (error: any) {
      setParseError(error?.message || "We couldn’t parse this CSV.");
      setFileName("");
      setHeaders([]);
      setRows([]);
      setMappingMode("full");
      setFullNameColumn("");
      setFirstNameColumn("");
      setLastNameColumn("");
      setEmailColumn(NO_COLUMN);
      setPhoneColumn(NO_COLUMN);
      setAddressMappingMode("full");
      setAreasColumns([]);
    }
  }

  async function handleImport() {
    try {
      setImporting(true);
      setImportError(null);
      setImportSummary(null);

      const payload = {
        mappings: {
          fullName: mappingMode === "full" ? fullNameColumn : null,
          firstName: mappingMode === "split" ? firstNameColumn : null,
          lastName: mappingMode === "split" ? lastNameColumn : null,
          email: emailColumn === NO_COLUMN ? null : emailColumn,
          phone: phoneColumn === NO_COLUMN ? null : phoneColumn,
          areas: needsAddressStep
            ? areasColumns.filter((column) => column && column !== NO_COLUMN)
            : [],
        },
        relationshipType,
        clientRole: relationshipType === "PARTNER" ? null : clientRole,
        rows,
      };

      const res = await fetch("/api/crm/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "Import failed. Please try again.");
      }

      setImportSummary({
        totalRows: data?.totalRows ?? rows.length,
        imported: data?.imported ?? 0,
        skippedDuplicates: data?.skippedDuplicates ?? 0,
        failed: data?.failed ?? 0,
      });

      if (onImported) {
        await onImported();
      }
    } catch (error: any) {
      setImportError(error?.message || "Import failed. Please try again.");
    } finally {
      setImporting(false);
    }
  }

  const isPreviewStep = step === 7;

  return (
    <Transition show={open} as={Fragment}>
      <Dialog onClose={() => {}} className="relative z-[9999]">
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-150"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-120"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto px-4 py-8">
          <div className="flex min-h-full items-center justify-center">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-150"
              enterFrom="opacity-0 translate-y-2 scale-[0.99]"
              enterTo="opacity-100 translate-y-0 scale-100"
              leave="ease-in duration-120"
              leaveFrom="opacity-100 translate-y-0 scale-100"
              leaveTo="opacity-0 translate-y-2 scale-[0.99]"
            >
              <DialogPanel className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-700/70 bg-gradient-to-b from-slate-900/95 to-slate-950/95 shadow-[0_0_60px_rgba(15,23,42,0.85)]">
                <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(244,210,106,0.14),transparent_55%)] opacity-70 blur-3xl" />

                <div className="flex items-start justify-between gap-4 border-b border-slate-800/80 px-6 py-5">
                  <div>
                    <DialogTitle className="text-[15px] font-semibold text-[var(--avillo-cream)]">
                      Import contacts
                    </DialogTitle>
                    <p className="mt-1 text-[11px] text-[var(--avillo-cream-muted)]">
                      Bring contacts into Avillo with a simple CSV import.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={onClose}
                    disabled={importing}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-600/80 bg-slate-900/70 text-[var(--avillo-cream-soft)] hover:border-red-400/80 disabled:opacity-50"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="border-b border-slate-800/70 px-6 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {visibleSteps.map((item, index) => {
                      const active = step === item;
                      const currentIndex = visibleSteps.indexOf(step);
                      const complete = index < currentIndex || !!importSummary;

                      return (
                        <div
                          key={item}
                          className={
                            "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] " +
                            (active
                              ? "border-amber-200/80 bg-amber-400/10 text-amber-100"
                              : complete
                                ? "border-emerald-300/60 bg-emerald-500/10 text-emerald-100"
                                : "border-slate-700/80 bg-slate-900/60 text-[var(--avillo-cream-muted)]")
                          }
                        >
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-current text-[9px]">
                            {complete ? <Check size={10} /> : index + 1}
                          </span>
                          {stepLabel(item)}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="px-6 py-5">
                  {!importSummary && (
                    <>
                      {step === 1 && (
                        <section className="space-y-4">
                          <div>
                            <p className="text-[12px] font-semibold text-[var(--avillo-cream-soft)]">
                              Upload CSV
                            </p>
                            <p className="mt-1 text-[11px] text-[var(--avillo-cream-muted)]">
                              CSV only. First row should contain your column headers.
                            </p>
                          </div>

                          <label className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-600/80 bg-slate-950/60 px-6 py-8 text-center transition hover:border-amber-100/60 hover:bg-slate-950/80">
                            <Upload
                              className="mb-4 text-[var(--avillo-cream-muted)]"
                              size={24}
                            />
                            <p className="text-sm font-medium text-slate-50">
                              {fileName || "Choose a CSV file"}
                            </p>
                            <p className="mt-2 text-[11px] text-[var(--avillo-cream-muted)]">
                              Upload a contact export and we’ll help you map the basics.
                            </p>
                            <p className="mt-2 text-[11px] text-[var(--avillo-cream-muted)]">
                              Import up to {MAX_IMPORT_ROWS.toLocaleString()} contacts per
                              file. Need more? Contact support@avillo.io
                            </p>
                            <input
                              type="file"
                              accept=".csv,text/csv"
                              className="hidden"
                              onChange={(e) =>
                                void handleFileChange(e.target.files?.[0] ?? null)
                              }
                            />
                          </label>

                          {rows.length > 0 && (
                            <div className="rounded-xl border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-[11px] text-emerald-50">
                              <div className="flex items-start gap-3">
                                <div className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-300/50 bg-emerald-500/10 text-emerald-100">
                                  <Check size={12} />
                                </div>
                                <div>
                                  <p className="font-semibold text-emerald-100">
                                    File uploaded successfully
                                  </p>
                                  <p className="mt-1">
                                    <span className="font-semibold text-slate-50">
                                      {fileName}
                                    </span>
                                  </p>
                                  <p className="mt-1 text-emerald-50/80">
                                    {rows.length} row{rows.length === 1 ? "" : "s"} detected •{" "}
                                    {headers.length} column{headers.length === 1 ? "" : "s"} found
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                          {parseError && (
                            <div className="rounded-xl border border-rose-400/60 bg-rose-950/40 px-4 py-3 text-[11px] text-rose-50">
                              {parseError}
                            </div>
                          )}
                        </section>
                      )}

                      {step === 2 && (
                        <section className="space-y-4">
                          <div>
                            <p className="text-[12px] font-semibold text-[var(--avillo-cream-soft)]">
                              Choose contact type
                            </p>
                            <p className="mt-1 text-[11px] text-[var(--avillo-cream-muted)]">
                              This setting applies to all rows. Import different types separately.
                            </p>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            <button
                              type="button"
                              onClick={() => {
                                setRelationshipType("CLIENT");
                                setClientRole((prev) => prev ?? "BUYER");
                              }}
                              className={
                                "rounded-2xl border px-4 py-4 text-left transition " +
                                (relationshipType === "CLIENT"
                                  ? "border-amber-200/80 bg-amber-400/10 shadow-[0_0_28px_rgba(248,250,252,0.16)]"
                                  : "border-slate-700/80 bg-slate-950/50 hover:border-amber-100/60")
                              }
                            >
                              <p className="text-sm font-semibold text-slate-50">Client</p>
                              <p className="mt-1 text-[11px] text-[var(--avillo-cream-muted)]">
                                Import these contacts as clients in your pipeline.
                              </p>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setRelationshipType("PARTNER");
                                setClientRole(null);
                              }}
                              className={
                                "rounded-2xl border px-4 py-4 text-left transition " +
                                (relationshipType === "PARTNER"
                                  ? "border-violet-200/70 bg-violet-500/10 shadow-[0_0_28px_rgba(167,139,250,0.16)]"
                                  : "border-slate-700/80 bg-slate-950/50 hover:border-violet-200/50")
                              }
                            >
                              <p className="text-sm font-semibold text-slate-50">Partner</p>
                              <p className="mt-1 text-[11px] text-[var(--avillo-cream-muted)]">
                                Import these contacts as partners.
                              </p>
                            </button>
                          </div>

                          {relationshipType === "CLIENT" && (
                            <div className="space-y-2">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
                                Client role
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <TypePill
                                  label="Buyer"
                                  active={clientRole === "BUYER"}
                                  onClick={() => setClientRole("BUYER")}
                                />
                                <TypePill
                                  label="Seller"
                                  active={clientRole === "SELLER"}
                                  onClick={() => setClientRole("SELLER")}
                                />
                                <TypePill
                                  label="Buyer & Seller"
                                  active={clientRole === "BOTH"}
                                  onClick={() => setClientRole("BOTH")}
                                />
                              </div>
                            </div>
                          )}
                        </section>
                      )}

                      {step === 3 && (
                        <section className="space-y-4">
                          <div>
                            <p className="text-[12px] font-semibold text-[var(--avillo-cream-soft)]">
                              Confirm name column
                            </p>
                            <p className="mt-1 text-[11px] text-[var(--avillo-cream-muted)]">
                              Choose either one full name column or separate first and last name columns.
                            </p>
                          </div>

                          <div className="inline-flex rounded-full border border-slate-700/80 bg-slate-950/70 p-1 text-[11px] font-semibold text-slate-300">
                            <button
                              type="button"
                              onClick={() => setMappingMode("full")}
                              className={
                                "rounded-full px-3 py-1.5 transition " +
                                (mappingMode === "full"
                                  ? "bg-slate-800 text-amber-100 shadow-[0_0_18px_rgba(148,163,184,0.3)]"
                                  : "text-slate-400")
                              }
                            >
                              Full name
                            </button>
                            <button
                              type="button"
                              onClick={() => setMappingMode("split")}
                              className={
                                "rounded-full px-3 py-1.5 transition " +
                                (mappingMode === "split"
                                  ? "bg-slate-800 text-amber-100 shadow-[0_0_18px_rgba(148,163,184,0.3)]"
                                  : "text-slate-400")
                              }
                            >
                              First + last
                            </button>
                          </div>

                          {mappingMode === "full" ? (
                            <SelectField
                              label="Full name column"
                              value={fullNameColumn}
                              onChange={setFullNameColumn}
                              options={headerOptions}
                              placeholder="Select a name column…"
                            />
                          ) : (
                            <div className="grid gap-3 md:grid-cols-2">
                              <SelectField
                                label="First name column"
                                value={firstNameColumn}
                                onChange={setFirstNameColumn}
                                options={headerOptions}
                                placeholder="Select first name…"
                              />
                              <SelectField
                                label="Last name column"
                                value={lastNameColumn}
                                onChange={setLastNameColumn}
                                options={headerOptions}
                                placeholder="Select last name…"
                              />
                            </div>
                          )}
                        </section>
                      )}

                      {step === 4 && (
                        <section className="space-y-4">
                          <div>
                            <p className="text-[12px] font-semibold text-[var(--avillo-cream-soft)]">
                              Confirm email column
                            </p>
                            <p className="mt-1 text-[11px] text-[var(--avillo-cream-muted)]">
                              Email is optional, but recommended for cleaner matching and follow-up.
                            </p>
                          </div>

                          <SelectField
                            label="Email column"
                            value={emailColumn}
                            onChange={setEmailColumn}
                            options={[
                              { value: NO_COLUMN, label: "No email column" },
                              ...headerOptions,
                            ]}
                            placeholder="Select email column…"
                          />
                        </section>
                      )}

                      {step === 5 && (
                        <section className="space-y-4">
                          <div>
                            <p className="text-[12px] font-semibold text-[var(--avillo-cream-soft)]">
                              Confirm phone column
                            </p>
                            <p className="mt-1 text-[11px] text-[var(--avillo-cream-muted)]">
                              Each row must have at least an email or a phone number to import.
                            </p>
                          </div>

                          <SelectField
                            label="Phone column"
                            value={phoneColumn}
                            onChange={setPhoneColumn}
                            options={[
                              { value: NO_COLUMN, label: "No phone column" },
                              ...headerOptions,
                            ]}
                            placeholder="Select phone column…"
                          />

                          {emailColumn === NO_COLUMN && phoneColumn === NO_COLUMN && (
                            <div className="rounded-xl border border-amber-300/50 bg-amber-500/10 px-4 py-3 text-[11px] text-amber-100">
                              Select at least one contact method: email or phone.
                            </div>
                          )}
                        </section>
                      )}

                      {step === 6 && needsAddressStep && (
                        <section className="space-y-4">
                          <div>
                            <p className="text-[12px] font-semibold text-[var(--avillo-cream-soft)]">
                              Confirm address columns
                            </p>
                            <p className="mt-1 text-[11px] text-[var(--avillo-cream-muted)]">
                              Choose either one full address column or separate columns like street, unit, city, state, and zip.
                            </p>
                          </div>

                          <div className="inline-flex rounded-full border border-slate-700/80 bg-slate-950/70 p-1 text-[11px] font-semibold text-slate-300">
                            <button
                              type="button"
                              onClick={() => {
                                setAddressMappingMode("full");
                                setAreasColumns([NO_COLUMN]);
                              }}
                              className={
                                "rounded-full px-3 py-1.5 transition " +
                                (addressMappingMode === "full"
                                  ? "bg-slate-800 text-amber-100 shadow-[0_0_18px_rgba(148,163,184,0.3)]"
                                  : "text-slate-400")
                              }
                            >
                              Full address
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAddressMappingMode("split");
                                setAreasColumns([NO_COLUMN, NO_COLUMN, NO_COLUMN, NO_COLUMN, NO_COLUMN]);
                              }}
                              className={
                                "rounded-full px-3 py-1.5 transition " +
                                (addressMappingMode === "split"
                                  ? "bg-slate-800 text-amber-100 shadow-[0_0_18px_rgba(148,163,184,0.3)]"
                                  : "text-slate-400")
                              }
                            >
                              Street + unit + city + state + zip
                            </button>
                          </div>

                          {addressMappingMode === "full" ? (
                            <SelectField
                              label="Address column"
                              value={getAreaColumnAt(0)}
                              onChange={(value) => setAreaColumnAt(0, value)}
                              options={[{ value: NO_COLUMN, label: "No address column" }, ...headerOptions]}
                              placeholder="Select address column…"
                            />
                          ) : (
                            <div className="grid gap-3 md:grid-cols-2">
                              <SelectField
                                label="Street column"
                                value={getAreaColumnAt(0)}
                                onChange={(value) => setAreaColumnAt(0, value)}
                                options={[{ value: NO_COLUMN, label: "No street column" }, ...headerOptions]}
                                placeholder="Select street column…"
                              />
                              <SelectField
                                label="Apt / Unit / Suite column"
                                value={getAreaColumnAt(1)}
                                onChange={(value) => setAreaColumnAt(1, value)}
                                options={[{ value: NO_COLUMN, label: "No unit column" }, ...headerOptions]}
                                placeholder="Select apt / unit / suite column…"
                              />
                              <SelectField
                                label="City column"
                                value={getAreaColumnAt(2)}
                                onChange={(value) => setAreaColumnAt(2, value)}
                                options={[{ value: NO_COLUMN, label: "No city column" }, ...headerOptions]}
                                placeholder="Select city column…"
                              />
                              <SelectField
                                label="State column"
                                value={getAreaColumnAt(3)}
                                onChange={(value) => setAreaColumnAt(3, value)}
                                options={[{ value: NO_COLUMN, label: "No state column" }, ...headerOptions]}
                                placeholder="Select state column…"
                              />
                              <SelectField
                                label="Zip column"
                                value={getAreaColumnAt(4)}
                                onChange={(value) => setAreaColumnAt(4, value)}
                                options={[{ value: NO_COLUMN, label: "No zip column" }, ...headerOptions]}
                                placeholder="Select zip column…"
                              />
                            </div>
                          )}

                          {!(addressMappingMode === "full"
                            ? !!cleanString(getAreaColumnAt(0)) && getAreaColumnAt(0) !== NO_COLUMN
                            : [
                                getAreaColumnAt(0),
                                getAreaColumnAt(1),
                                getAreaColumnAt(2),
                                getAreaColumnAt(3),
                                getAreaColumnAt(4),
                              ].some((column) => !!cleanString(column) && column !== NO_COLUMN)) && (
                            <div className="rounded-xl border border-amber-300/40 bg-amber-500/10 px-4 py-3 text-[11px] text-amber-100">
                              Select at least one address-related column.
                            </div>
                          )}

                          {addressMappingMode === "split" && (
                            <div className="rounded-xl border border-blue-400/40 bg-blue-500/10 px-4 py-3 text-[11px] text-blue-100">
                              <p className="font-semibold text-blue-50">How this works</p>
                              <p className="mt-1 text-blue-200/80">
                                We’ll join the selected address columns in the order shown and save the combined result.
                              </p>
                            </div>
                          )}
                        </section>
                      )}

                      {step === 7 && (
                        <section className="space-y-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-[12px] font-semibold text-[var(--avillo-cream-soft)]">
                                Preview import
                              </p>
                              <p className="mt-1 text-[11px] text-[var(--avillo-cream-muted)]">
                                Review the first 10 rows before importing.
                              </p>
                            </div>

                            <span className="rounded-full border border-slate-700/80 bg-slate-900/70 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100">
                              {getContactTypeLabel(relationshipType, clientRole)}
                            </span>
                          </div>

                          <div className="overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950/70">
                            <div
                              className={
                                needsAddressStep
                                  ? "grid grid-cols-[70px_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_120px_minmax(0,1fr)] gap-3 border-b border-slate-800/80 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--avillo-cream-muted)]"
                                  : "grid grid-cols-[70px_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_120px_minmax(0,1fr)] gap-3 border-b border-slate-800/80 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--avillo-cream-muted)]"
                              }
                            >
                              <div>Row</div>
                              <div>Name</div>
                              <div>Email</div>
                              <div>Phone</div>
                              {needsAddressStep && <div>Address</div>}
                              <div>Status</div>
                              <div>Warnings</div>
                            </div>

                            <div className="max-h-[360px] overflow-y-auto">
                              {previewRows.map((row) => (
                                <div
                                  key={row.rowIndex}
                                  className={
                                    needsAddressStep
                                      ? "grid grid-cols-[70px_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_120px_minmax(0,1fr)] gap-3 border-b border-slate-800/60 px-4 py-3 text-[11px] text-[var(--avillo-cream-soft)] last:border-b-0"
                                      : "grid grid-cols-[70px_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_120px_minmax(0,1fr)] gap-3 border-b border-slate-800/60 px-4 py-3 text-[11px] text-[var(--avillo-cream-soft)] last:border-b-0"
                                  }
                                >
                                  <div className="text-[var(--avillo-cream-muted)]">
                                    {row.rowIndex}
                                  </div>
                                  <div className="truncate text-slate-50">
                                    {row.name || "—"}
                                  </div>
                                  <div className="truncate">{row.email || "—"}</div>
                                  <div className="truncate">{row.phone || "—"}</div>
                                  {needsAddressStep && (
                                    <div className="truncate">{row.address || "—"}</div>
                                  )}
                                  <div>
                                    <span
                                      className={
                                        "inline-flex rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] " +
                                        (row.duplicate
                                          ? "border-amber-200/70 bg-amber-500/10 text-amber-100"
                                          : "border-emerald-200/70 bg-emerald-500/10 text-emerald-100")
                                      }
                                    >
                                      {row.duplicate ? "Duplicate" : "Mapped"}
                                    </span>
                                  </div>
                                  <div className="text-[var(--avillo-cream-muted)]">
                                    {row.warnings.length
                                      ? row.warnings.join(" • ")
                                      : "—"}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-xl border border-slate-700/80 bg-slate-900/60 px-4 py-3 text-[11px] text-[var(--avillo-cream-soft)]">
                            <p>
                              Total rows:{" "}
                              <span className="font-semibold text-slate-50">
                                {rows.length}
                              </span>
                            </p>
                            <p className="mt-1 text-[var(--avillo-cream-muted)]">
                              Duplicates are skipped during import. Existing contacts are
                              never overwritten in v1.
                            </p>
                          </div>

                          {importError && (
                            <div className="rounded-xl border border-rose-400/60 bg-rose-950/40 px-4 py-3 text-[11px] text-rose-50">
                              {importError}
                            </div>
                          )}
                        </section>
                      )}
                    </>
                  )}

                  {importSummary && (
                    <section className="space-y-4">
                      <div className="rounded-2xl border border-emerald-300/40 bg-emerald-500/10 px-5 py-5">
                        <div className="flex items-center gap-3">
                          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-emerald-300/50 bg-emerald-500/10 text-emerald-100">
                            <Check size={18} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-emerald-100">
                              Import complete
                            </p>
                            <p className="mt-1 text-[11px] text-emerald-50/80">
                              Your CSV has been processed successfully.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-4">
                        <SummaryCard
                          label="Total rows"
                          value={String(importSummary.totalRows)}
                        />
                        <SummaryCard
                          label="Imported"
                          value={String(importSummary.imported)}
                        />
                        <SummaryCard
                          label="Skipped duplicates"
                          value={String(importSummary.skippedDuplicates)}
                        />
                        <SummaryCard
                          label="Failed"
                          value={String(importSummary.failed)}
                        />
                      </div>
                    </section>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-slate-800/80 px-6 py-4">
                  <div className="text-[11px] text-[var(--avillo-cream-muted)]">
                    {!importSummary
                      ? `Import is limited to name, email, phone, address, and contact type in v1. Max ${MAX_IMPORT_ROWS.toLocaleString()} contacts per file.`
                      : "You can now close this modal and review imported contacts in People."}
                  </div>

                  <div className="flex items-center gap-2">
                    {!importSummary ? (
                      <>
                        <button
                          type="button"
                          onClick={step === 1 ? onClose : handleBack}
                          disabled={importing}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-950/70 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--avillo-cream-soft)] hover:border-amber-100/70 hover:text-amber-50 disabled:opacity-50"
                        >
                          {step === 1 ? null : <ChevronLeft size={14} />}
                          {step === 1 ? "Cancel" : "Back"}
                        </button>

                        {!isPreviewStep ? (
                          <button
                            type="button"
                            onClick={handleNext}
                            disabled={!canGoNext}
                            className="inline-flex items-center gap-2 rounded-full border border-amber-100/70 bg-amber-50/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100 shadow-[0_0_22px_rgba(248,250,252,0.18)] hover:bg-amber-50/20 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Next
                            <ChevronRight size={14} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleImport()}
                            disabled={importing}
                            className="inline-flex items-center gap-2 rounded-full border border-amber-100/70 bg-amber-50/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100 shadow-[0_0_22px_rgba(248,250,252,0.18)] hover:bg-amber-50/20 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {importing ? (
                              <>
                                <Loader2 size={14} className="animate-spin" />
                                Importing…
                              </>
                            ) : (
                              <>
                                Import contacts
                                <Check size={14} />
                              </>
                            )}
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex items-center gap-2 rounded-full border border-amber-100/70 bg-amber-50/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100 shadow-[0_0_22px_rgba(248,250,252,0.18)] hover:bg-amber-50/20"
                      >
                        Done
                      </button>
                    )}
                  </div>
                </div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: HeaderOption[];
  placeholder: string;
}) {
  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
        {label}
      </p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border-none bg-transparent text-[12px] text-slate-50 outline-none"
      >
        <option value="" className="bg-slate-900 text-slate-50">
          {placeholder}
        </option>
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            className="bg-slate-900 text-slate-50"
          >
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TypePill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors " +
        (active
          ? "border-amber-100/90 bg-amber-400/15 text-amber-50 shadow-[0_0_16px_rgba(248,250,252,0.22)]"
          : "border-slate-700/80 bg-slate-900/70 text-[var(--avillo-cream-muted)] hover:border-amber-100/70 hover:text-amber-50")
      }
    >
      {label}
    </button>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--avillo-cream-muted)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-50">{value}</p>
    </div>
  );
}