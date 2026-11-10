/*
 * Sana Reading — Lesson State
 * الحالة الأساسية لدرس القراءة فقط.
 * لا يغيّر شكل بيانات localStorage أو IndexedDB.
 */
const DEFAULT_TEXT = "تدوينُ رؤوسِ الأقلامِ إحدى التقنياتِ التي دعتِ الحاجةُ إليها، نظرًا لكثرةِ وسائلِ الاتصالِ، فلمَ لا تبادرُ إلى استخدامِ هذه التقنية في دراسِتك؟";
const readingLessonState={words:[],idx:0,score:0};
const readingMicState={active:false};
const readingSession={mode:'word',pausePreset:'normal'};
const readingPlaybackState={active:false,paused:false,index:0};
