
export enum TaskStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

export type RecurrencePattern = 'NONE' | 'SECOND' | 'MINUTE' | 'HOUR' | 'DAILY' | 'WEEKLY' | 'WORKDAYS' | 'MONTHLY';

export interface ScheduledTask {
  id: string;
  description: string;
  type: 'AI_SEARCH_NEWS' | 'REMINDER' | 'AUTOMATION';
  status: TaskStatus;
  createdAt: string;
  lastRun?: string;
  nextRun: string; 
  
  isRecurring: boolean;
  recurrencePattern: RecurrencePattern;
  intervalValue: number; // e.g., 5 if pattern is MINUTE for "every 5 minutes"
  priority: 'NORMAL' | 'HIGH';
  persistent: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
}
