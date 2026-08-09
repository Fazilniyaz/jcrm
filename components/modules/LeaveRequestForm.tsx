"use client";

import { useState } from "react";
import { Send, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button, tone } from "@/components/ui";
import { Modal } from "@/components/ui/overlay";
import { FormGrid, SelectInput, Span, TextArea, TextInput } from "@/components/ui/form";
import { useStore } from "@/lib/store/StoreProvider";
import { daysBetween } from "@/lib/store/selectors";
import { LEAVE_TYPES, SHORT_NOTICE_HOURS, type LeaveType } from "@/lib/store/types";

/**
 * Raise a leave request.
 *
 * The notice warning is shown live while filling the form rather than only on
 * the resulting row — telling someone their request was short notice after they
 * submitted it is too late to be useful.
 */
export default function LeaveRequestForm({
  open,
  employeeId,
  onClose,
}: {
  open: boolean;
  employeeId: string;
  onClose: () => void;
}) {
  const { createLeaveRequest } = useStore();

  const [type, setType] = useState<LeaveType>("Annual");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const days = from && to ? daysBetween(from, to) : 0;

  /*
   * Notice is measured when the date is picked, not during render.
   *
   * It depends on the wall clock, and reading that while rendering makes the
   * component impure — the same props would produce a different answer on a
   * re-render. Computing it in the change handler keeps render a pure function
   * of state, and the answer only needs to be right at the moment of choosing.
   */
  const [noticeHrs, setNoticeHrs] = useState<number | null>(null);

  const pickFrom = (v: string) => {
    setFrom(v);
    setNoticeHrs(v ? (new Date(`${v}T00:00:00`).getTime() - Date.now()) / 3600000 : null);
    setErrors((e) => ({ ...e, from: "" }));
  };

  const short = noticeHrs !== null && noticeHrs < SHORT_NOTICE_HOURS;

  function save() {
    const next: Record<string, string> = {};
    if (!from) next.from = "Pick a first day.";
    if (!to) next.to = "Pick a last day.";
    if (from && to && to < from) next.to = "The last day can't fall before the first.";
    if (!reason.trim()) next.reason = "Give your manager a reason.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    createLeaveRequest({ employeeId, type, from, to, days, reason: reason.trim() });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request leave"
      desc="This goes to your manager and the admin portals for a decision."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={Send} onClick={save}>
            Submit request
          </Button>
        </>
      }
    >
      <FormGrid>
        <SelectInput<LeaveType>
          label="Leave type"
          value={type}
          onChange={setType}
          options={LEAVE_TYPES.map((t) => ({ value: t, label: t }))}
        />
        <TextInput
          label="Days requested"
          value={days > 0 ? `${days} day${days === 1 ? "" : "s"}` : "—"}
          onChange={() => {}}
          disabled
          hint="Counted inclusively from the dates below."
        />

        <TextInput
          label="First day"
          required
          type="date"
          value={from}
          onChange={pickFrom}
          error={errors.from}
        />
        <TextInput
          label="Last day"
          required
          type="date"
          value={to}
          onChange={(v) => {
            setTo(v);
            setErrors((e) => ({ ...e, to: "" }));
          }}
          error={errors.to}
        />

        <Span>
          <TextArea
            label="Reason"
            required
            rows={3}
            value={reason}
            onChange={(v) => {
              setReason(v);
              setErrors((e) => ({ ...e, reason: "" }));
            }}
            placeholder="Enough context for your manager to decide without asking."
            error={errors.reason}
          />
        </Span>

        {noticeHrs !== null && (
          <Span>
            <p
              className="flex items-start gap-2 rounded-sm p-3 text-[0.75rem] leading-relaxed"
              style={{
                background: short ? tone.red.soft : tone.sky.soft,
                color: short ? tone.red.text : tone.sky.text,
              }}
            >
              {short ? (
                <ShieldAlert size={15} className="mt-px shrink-0" />
              ) : (
                <ShieldCheck size={15} className="mt-px shrink-0" />
              )}
              <span>
                {short ? (
                  <>
                    <strong>Short notice.</strong> This starts{" "}
                    {noticeHrs < 0
                      ? "in the past"
                      : `in about ${Math.max(0, Math.round(noticeHrs))} hours`}{" "}
                    — under the {SHORT_NOTICE_HOURS}-hour threshold, so it will be flagged for your
                    manager.
                  </>
                ) : (
                  <>
                    <strong>Good notice.</strong> That is about{" "}
                    {Math.round(noticeHrs / 24)} day{Math.round(noticeHrs / 24) === 1 ? "" : "s"}{" "}
                    ahead.
                  </>
                )}
              </span>
            </p>
          </Span>
        )}
      </FormGrid>
    </Modal>
  );
}
