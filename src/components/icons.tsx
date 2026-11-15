import {
  Activity, Apple, Bed, Bike, BookMarked, BookOpen, Brain, Briefcase, Camera, Cigarette, Clapperboard, Coffee,
  Dumbbell, Droplets, Flame, Footprints, Gamepad2, Guitar, Heart, Leaf, type LucideIcon, Moon, Music, PenLine,
  Pill, Salad, Smartphone, Sparkles, Sun, Target, Timer, Tv, Users, Wine,
} from 'lucide-react';

export const HABIT_ICONS: Record<string, LucideIcon> = {
  dumbbell: Dumbbell,
  'book-open': BookOpen,
  'book-marked': BookMarked,
  clapperboard: Clapperboard,
  droplets: Droplets,
  pill: Pill,
  moon: Moon,
  footprints: Footprints,
  activity: Activity,
  bike: Bike,
  brain: Brain,
  heart: Heart,
  leaf: Leaf,
  salad: Salad,
  apple: Apple,
  sun: Sun,
  bed: Bed,
  'pen-line': PenLine,
  music: Music,
  guitar: Guitar,
  camera: Camera,
  briefcase: Briefcase,
  users: Users,
  target: Target,
  timer: Timer,
  sparkles: Sparkles,
  flame: Flame,
  coffee: Coffee,
  smartphone: Smartphone,
  tv: Tv,
  gamepad: Gamepad2,
  wine: Wine,
  cigarette: Cigarette,
};

export const BAD_ICON_KEYS = ['smartphone', 'tv', 'gamepad', 'coffee', 'wine', 'cigarette', 'bed', 'apple', 'flame', 'target'];

export function HabitIcon({ name, size = 20, className = '' }: { name: string; size?: number; className?: string }) {
  const Icon = HABIT_ICONS[name] ?? Target;
  return <Icon size={size} strokeWidth={1.8} className={className} aria-hidden />;
}
