import { ArrowDownToLine } from "lucide-react";
import { Button } from "../components/ui";
import { statusTone } from "./format";
import type { Case } from "./types";

export type Action = (work: () => Promise<Case>, message?: string) => Promise<boolean>;

export function Status({value}: {value: string}) {
  return <span className={`status ${statusTone(value)}`}><span/>{value}</span>;
}

export function Download({text, name, label='Download draft'}: {text: string; name: string; label?:string}) {
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], {type: name.endsWith('.json')?'application/json;charset=utf-8':"text/plain;charset=utf-8"}));
    const link = document.createElement("a"); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <Button onClick={download}><ArrowDownToLine size={15}/>{label}</Button>;
}
