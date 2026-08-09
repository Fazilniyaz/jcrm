"use client";

import { Coins, RefreshCw } from "lucide-react";
import { SelectInput, TextInput } from "@/components/ui/form";
import { tone } from "@/components/ui";
import { useListCountriesQuery } from "@/lib/api/api";

/*
 * Country, city and currency for one office.
 *
 * Shared by the master's Create Company form (where it describes the head
 * office) and the Branches module (where it describes any office), so the two
 * cannot disagree about what a location is.
 *
 * Currency is NOT an input. It is shown, derived from the selected country, and
 * the server looks it up again on write from the country code alone — the value
 * rendered here never travels. That is what stops a request pairing India with
 * dollars and quietly mis-stating every figure reported against the branch.
 */

export function useCountries() {
  const { data: countries = [], isLoading, isError, refetch } = useListCountriesQuery();
  return { countries, isLoading, isError, refetch };
}

export default function BranchLocationFields({
  country,
  city,
  onCountryChange,
  onCityChange,
  countryError,
  cityError,
}: {
  country: string;
  city: string;
  onCountryChange: (code: string) => void;
  onCityChange: (city: string) => void;
  countryError?: string;
  cityError?: string;
}) {
  const { countries, isLoading, isError, refetch } = useCountries();
  const selected = countries.find((c) => c.code === country);

  // Every state is named. A select that can only ever say "Loading countries…"
  // gives no way to tell a slow request from a failed one.
  const placeholder = isLoading
    ? "Loading countries…"
    : isError
      ? "Couldn't load countries"
      : countries.length === 0
        ? "No countries available"
        : "Select a country…";

  return (
    <>
      <div>
        <SelectInput
          label="Country"
          value={country}
          onChange={onCountryChange}
          required
          error={countryError}
          options={[
            { value: "", label: placeholder },
            ...countries.map((c) => ({ value: c.code, label: c.name })),
          ]}
          hint={isError ? undefined : "Sets the branch's currency."}
        />
        {isError && (
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-1 flex items-center gap-1 text-[0.6875rem] underline"
            style={{ color: tone.red.text }}
          >
            <RefreshCw size={11} /> Can&rsquo;t reach the API — retry
          </button>
        )}
      </div>

      <TextInput
        label="City"
        value={city}
        onChange={onCityChange}
        placeholder="Kochi"
        required
        error={cityError}
      />

      <div>
        <span className="mb-1.5 block text-[0.8125rem] font-medium text-heading">Currency</span>
        <div
          className="flex h-10 items-center gap-2 rounded-sm border border-input-border px-3 text-[0.8125rem]"
          style={{ background: "var(--subtle, transparent)" }}
        >
          <Coins size={14} style={{ color: selected ? tone.sky.text : undefined }} className={selected ? "" : "text-muted"} />
          {selected ? (
            <span className="truncate">
              <span className="font-semibold text-heading">{selected.currency}</span>
              <span className="text-muted">
                {" "}
                — {selected.currencyName} ({selected.symbol})
              </span>
            </span>
          ) : (
            <span className="text-muted">Choose a country first</span>
          )}
        </div>
        <p className="mt-1 text-[0.6875rem] text-muted">
          Set automatically from the country and used for this branch&rsquo;s figures.
        </p>
      </div>
    </>
  );
}
