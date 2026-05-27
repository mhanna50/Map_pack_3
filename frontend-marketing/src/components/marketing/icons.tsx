import {
  BarChart3,
  Camera,
  ClipboardCheck,
  Edit3,
  HelpCircle,
  ListChecks,
  MapPinned,
  MessageSquareText,
  MonitorSmartphone,
  PhoneCall,
  Radar,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";

export const marketingIcons: Record<string, LucideIcon> = {
  camera: Camera,
  chart: BarChart3,
  clipboard: ClipboardCheck,
  edit: Edit3,
  help: HelpCircle,
  list: ListChecks,
  map: MapPinned,
  messages: MessageSquareText,
  monitor: MonitorSmartphone,
  phone: PhoneCall,
  radar: Radar,
  star: Star,
  users: Users,
};

export function MarketingIcon({ name, className }: { name: string; className?: string }) {
  const Icon = marketingIcons[name] ?? MapPinned;
  return <Icon className={className} aria-hidden="true" />;
}

