import { useEffect, useMemo, useRef, useState } from "react"
import aafeMarkOrange from "./assets/aafe-mark-orange.svg"
import AafeLogo, { AafeMark } from "./AafeLogo"

type Screen =
  | "home"
  | "choose"
  | "paste"
  | "single"
  | "seats"
  | "saved"
  | "expired"
type Language = "EN" | "中文" | "ES" | "한국어"
type TextScale = 1 | 1.125 | 1.25
type GuestStatus = "confirmed" | "waiting" | "empty"

interface LanguageOption {
  code: Language
  label: string
}

interface LogoProps {
  inverse?: boolean
  compact?: boolean
}

type Guest = {
  seat: number
  first: string
  last: string
  title: string
  organization: string
  email: string
  status: GuestStatus
  dietary?: string
  accessibility?: string
  updatedAt?: string
}

type GuestField = "first" | "last" | "title" | "organization" | "email" | "dietary" | "accessibility"

type PaymentStatus = "paid" | "partial" | "pledged" | "comp"

type ActivityKind = "orderRecorded" | "payment" | "linkSent" | "added" | "bulkAdded" | "updated" | "replaced" | "removed" | "confirmed" | "logoUploaded"

type Activity = {
  id: number
  at: string
  kind: ActivityKind
  actor: "you" | "aafe"
  name?: string
  previousName?: string
  seat?: number
  seats?: [number, number]
  count?: number
  amount?: number
  fields?: GuestField[]
}

type IconProps = {
  name: string
  size?: number
}

type SeatRowProps = {
  guest: Guest
  onClick: () => void
  t: Dict
  language: Language
  galaNight: boolean
}

const initialGuests: Guest[] = [
  {
    seat: 1,
    first: "Evelyn",
    last: "Park",
    title: "Chief Executive Officer",
    organization: "Harborline Community Bank",
    email: "evelyn.park@harborline.com",
    status: "confirmed",
    accessibility: "Step-free entrance",
    updatedAt: "2026-09-12T16:20:00",
  },
  {
    seat: 2,
    first: "Marcus",
    last: "Bell",
    title: "Chief Financial Officer",
    organization: "Harborline Community Bank",
    email: "marcus.bell@harborline.com",
    status: "confirmed",
  },
  {
    seat: 3,
    first: "Sofia",
    last: "Reyes",
    title: "VP, Community Lending",
    organization: "Harborline Community Bank",
    email: "sofia.reyes@harborline.com",
    status: "confirmed",
    dietary: "Vegetarian",
    updatedAt: "2026-09-15T15:40:00",
  },
  {
    seat: 4,
    first: "Hao",
    last: "Zhang",
    title: "Branch Manager, Flushing",
    organization: "Harborline Community Bank",
    email: "hao.zhang@harborline.com",
    status: "confirmed",
  },
  {
    seat: 5,
    first: "Amara",
    last: "Okoye",
    title: "Director of Philanthropy",
    organization: "Harborline Community Bank",
    email: "amara.okoye@harborline.com",
    status: "confirmed",
  },
  {
    seat: 6,
    first: "Liam",
    last: "Nguyen",
    title: "Board Member",
    organization: "Harborline Community Bank",
    email: "liam.nguyen@harborline.com",
    status: "confirmed",
  },
  {
    seat: 7,
    first: "Rachel",
    last: "Kim",
    title: "SVP, Operations",
    organization: "Harborline Community Bank",
    email: "rachel.kim@harborline.com",
    status: "confirmed",
  },
  {
    seat: 8,
    first: "Nina",
    last: "Patel",
    title: "General Counsel",
    organization: "Harborline Community Bank",
    email: "nina.patel@harborline.com",
    status: "confirmed",
  },
  {
    seat: 9,
    first: "Daniel",
    last: "Wu",
    title: "Community Relations Manager",
    organization: "Harborline Community Bank",
    email: "daniel.wu@harborline.com",
    status: "confirmed",
  },
  {
    seat: 10,
    first: "Grace",
    last: "Lee",
    title: "Regional President",
    organization: "Harborline Community Bank",
    email: "grace.lee@harborline.com",
    status: "confirmed",
  },
  {
    seat: 11,
    first: "Mateo",
    last: "Santos",
    title: "Senior Vice President",
    organization: "Harborline Community Bank",
    email: "mateo.santos@harborline.com",
    status: "waiting",
  },
  {
    seat: 12,
    first: "Ji-woo",
    last: "Han",
    title: "Director, Small Business",
    organization: "Harborline Community Bank",
    email: "jiwoo.han@harborline.com",
    status: "waiting",
  },
  ...Array.from({ length: 8 }, (_, i) => ({
    seat: i + 13,
    first: "",
    last: "",
    title: "",
    organization: "Harborline Community Bank",
    email: "",
    status: "empty" as const,
  })),
]

// ---- Sponsor-facing data (synthetic demo values). In the real app these come
// from the order the private link belongs to; payment method / card details are
// never sent to this page.
const LOCALES: Record<Language, string> = {
  EN: "en-US",
  中文: "zh-CN",
  ES: "es-US",
  한국어: "ko-KR",
}

const EVENT = {
  doors: "2027-05-20T18:00:00",
  program: "2027-05-20T19:15:00",
  venue: "Tribeca Rooftop",
  address: "2 Desbrosses St, New York, NY 10013",
}

const GALA_ARRIVAL_TIMES: Record<number, string> = {
  1: "2027-05-20T18:31:00",
  2: "2027-05-20T18:35:00",
  3: "2027-05-20T18:39:00",
  4: "2027-05-20T18:42:00",
  5: "2027-05-20T18:47:00",
}

const CONTRIBUTION = {
  commitment: 25000,
  comp: false,
  payments: [
    { date: "2026-08-28T12:00:00", amount: 10000 },
    { date: "2026-09-30T12:00:00", amount: 5000 },
  ],
}

function contributionSummary(c: typeof CONTRIBUTION) {
  const paid = c.payments.reduce((sum, p) => sum + p.amount, 0)
  const balance = Math.max(0, c.commitment - paid)
  const status: PaymentStatus = c.comp
    ? "comp"
    : c.payments.length && balance === 0
      ? "paid"
      : c.payments.length
        ? "partial"
        : "pledged"
  return { paid, balance, status }
}

const initialActivity: Activity[] = [
  { id: 1, at: "2026-08-20T10:12:00", kind: "orderRecorded", actor: "aafe" },
  {
    id: 2,
    at: "2026-08-28T14:05:00",
    kind: "payment",
    actor: "aafe",
    amount: 10000,
  },
  { id: 3, at: "2026-09-02T09:30:00", kind: "linkSent", actor: "aafe" },
  {
    id: 4,
    at: "2026-09-12T16:20:00",
    kind: "bulkAdded",
    actor: "you",
    count: 12,
    seats: [1, 12],
  },
  {
    id: 5,
    at: "2026-09-14T11:02:00",
    kind: "updated",
    actor: "you",
    name: "Marcus Bell",
    seat: 2,
    fields: ["title"],
  },
  {
    id: 6,
    at: "2026-09-15T15:40:00",
    kind: "updated",
    actor: "you",
    name: "Sofia Reyes",
    seat: 3,
    fields: ["dietary"],
  },
  {
    id: 7,
    at: "2026-09-18T10:00:00",
    kind: "confirmed",
    actor: "aafe",
    count: 10,
  },
  {
    id: 8,
    at: "2026-09-30T13:15:00",
    kind: "payment",
    actor: "aafe",
    amount: 5000,
  },
]

const GUEST_FIELDS: GuestField[] = [
  "first",
  "last",
  "title",
  "organization",
  "email",
  "dietary",
  "accessibility",
]

function changedFields(before: Guest, after: Partial<Guest>): GuestField[] {
  return GUEST_FIELDS.filter(
    (key) => (before[key] || "").trim() !== (after[key] || "").trim(),
  )
}

const fmtMoney = (language: Language, amount: number) =>
  new Intl.NumberFormat(LOCALES[language], {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount)

const fmtDate = (
  language: Language,
  iso: string,
  style: "date" | "dateTime" | "full" | "time" = "date",
) =>
  new Intl.DateTimeFormat(
    LOCALES[language],
    style === "full"
      ? { dateStyle: "full" }
      : style === "time"
        ? { timeStyle: "short" }
        : style === "dateTime"
          ? { dateStyle: "medium", timeStyle: "short" }
          : { dateStyle: "medium" },
  ).format(new Date(iso))

const translations = {
  EN: {
    welcome: "Welcome, Harborline Community Bank",
    subtitle: "Platinum Sponsor · AAFE Gala · May 20, 2027",
    yourGuests: "Your guests",
    needNames: (count: number) => `${count} guests still need names`,
    allNamed: "All 20 guests named ✓",
    named: "named",
    due: "Please add names by April 23, 2027",
    addGuests: "Add guests",
    seeSeats: "See your 20 seats",
    emptySeatNeedsGuest: "This seat needs a guest",
    nameThisGuest: "Name this guest",
    galaNightOption: "Gala night",
    arrived: "arrived",
    arrivedSummary: (arrived: number, total: number) =>
      `${arrived} of ${total} guests arrived`,
    arrivedAt: (time: string) => `✓ Arrived ${time}`,
    notArrived: "Not arrived yet",
    questions: "Questions or changes?",
    textSize: {
      group: "Text size",
      smaller: "Smaller text",
      default: "Default text size",
      larger: "Larger text",
    },
    logo: {
      uploadAria: "Upload your logo",
      changeAria: "Change your logo",
      addLabel: "Add your logo",
      needed: "Needed for event signs · by Apr 23",
      received: "Logo received",
      change: "Change",
      title: "Upload your logo",
      drop: "Drag your logo here or choose a file",
      requirements:
        "PNG or SVG, transparent background, at least 1000px wide.",
      signTitle: "Thank you to our sponsors",
      wallJoined: "✓ Harborline is on the sponsor wall",
      use: "Use this logo",
      chooseAnother: "Choose another",
      done: "Done",
    },
    privateLink:
      "This is your private link — please don't forward it. No password needed.",
    privacyDetails:
      "Guest information is used only to prepare for the AAFE Gala (badges, seating, check-in) and handled according to AAFE's data practices. This prototype uses made-up demo data.",
    expiredOption: "Expired link",
    expiredTitle: "This link isn't valid or has expired",
    expiredBody: "Please contact the AAFE Gala Team for a new link.",
    how: "How would you like to add guests?",
    paste: "Paste a list",
    pasteDesc:
      "Paste names from an email or spreadsheet. We’ll sort them into seats for you.",
    oneByOne: "Add one by one",
    oneDesc: "Fill in each guest yourself.",
    yourSeats: "Your 20 seats",
    saved: "Saved",
    savedBody:
      "AAFE will confirm the names before badges are printed. You can come back to this link any time.",
    backSeats: "Back to your seats",
    contribution: "Your contribution",
    paidOf: (paid: string, total: string) => `${paid} paid of ${total}`,
    balance: "Balance",
    howToPay: "How to pay",
    payOnline: "Pay online",
    mailCheck:
      "Or mail a check to AAFE, 111 Division St, New York, NY 10002 (demo)",
    seePayments: "See payments",
    paymentsTitle: "Payments received",
    paymentStatus: {
      paid: "Paid in full",
      partial: "Partially paid",
      pledged: "Pledged — payment not yet received",
      comp: "Complimentary",
    },
    noPayments: "No payment received yet. Questions? Email the AAFE Gala Team.",
    payNote: "For your security, payment details are not shown here.",
    doors: "Doors",
    program: "Program",
    dressCode: "Dress code",
    dressValue: "Cocktail attire",
    activityLink: "Activity",
    activityTitle: "Activity",
    activityHelp: "Every change is saved with the date and time.",
    actorYou: "You",
    actorAafe: "AAFE Gala Team",
    actOrder: "Sponsorship recorded",
    actLink: "Private guest-list link emailed",
    actLogo: "Logo uploaded for signage",
    actPayment: (amount: string) => `Payment received: ${amount}`,
    actAdded: (name: string, seat: number) => `${name} added to seat ${seat}`,
    actBulk: (count: number, from: number, to: number) =>
      `${count} guests added from a pasted list (seats ${from}–${to})`,
    actUpdated: (name: string, seat: number, fields: string) =>
      `${name} updated (seat ${seat}): ${fields}`,
    actReplaced: (oldName: string, newName: string, seat: number) =>
      `${oldName} replaced by ${newName} (seat ${seat})`,
    actRemoved: (name: string, seat: number) =>
      `${name} removed from seat ${seat}`,
    actConfirmed: (count: number) => `AAFE confirmed ${count} names for badges`,
    fieldNames: {
      first: "first name",
      last: "last name",
      title: "title",
      organization: "organization",
      email: "email",
      dietary: "dietary needs",
      accessibility: "accessibility needs",
    },
    listSep: ", ",
    dietaryLabel: "Dietary needs",
    accessLabel: "Accessibility needs",
    lastUpdated: "Last updated",
    validation: {
      required: "Required",
      invalidEmail: "Enter a valid email",
    },
  },
  中文: {
    welcome: "歡迎，Harborline Community Bank",
    subtitle: "白金贊助商 · AAFE 晚宴 · 2027年5月20日",
    yourGuests: "您的賓客",
    needNames: (count: number) => `還有 ${count} 位賓客需要填寫姓名`,
    allNamed: "20 位賓客已全部填寫 ✓",
    named: "已填寫",
    due: "請在 2027年4月23日前新增姓名",
    addGuests: "新增賓客",
    seeSeats: "查看您的 20 個座位",
    emptySeatNeedsGuest: "此座位需要一位賓客",
    nameThisGuest: "為此賓客填寫姓名",
    galaNightOption: "晚宴當晚",
    arrived: "已到場",
    arrivedSummary: (arrived: number, total: number) =>
      `${arrived} / ${total} 位賓客已到場`,
    arrivedAt: (time: string) => `✓ 已於 ${time} 到場`,
    notArrived: "尚未到場",
    questions: "有問題或需要更改？",
    textSize: {
      group: "文字大小",
      smaller: "縮小文字",
      default: "預設文字大小",
      larger: "放大文字",
    },
    logo: {
      uploadAria: "上傳您的標誌",
      changeAria: "更換您的標誌",
      addLabel: "新增您的標誌",
      needed: "活動標誌需要 · 4月23日前",
      received: "已收到標誌",
      change: "更換",
      title: "上傳您的標誌",
      drop: "將標誌拖曳至此處或選擇檔案",
      requirements: "PNG 或 SVG、透明背景、寬度至少 1000 像素。",
      signTitle: "感謝我們的贊助商",
      wallJoined: "✓ Harborline 已加入贊助商展示牆",
      use: "使用此標誌",
      chooseAnother: "選擇其他檔案",
      done: "完成",
    },
    privateLink: "這是您的專屬連結 — 請勿轉寄。無需密碼。",
    privacyDetails:
      "賓客資料僅用於籌備 AAFE 晚宴（名牌、座位安排、報到），並依照 AAFE 的資料處理規範處理。此原型使用虛構的示範資料。",
    expiredOption: "過期連結",
    expiredTitle: "此連結無效或已過期",
    expiredBody: "請聯絡 AAFE 晚宴團隊以取得新連結。",
    how: "您想如何新增賓客？",
    paste: "貼上名單",
    pasteDesc: "從電子郵件或試算表貼上姓名。我們會自動分配座位。",
    oneByOne: "逐一新增",
    oneDesc: "自行填寫每位賓客的資訊。",
    yourSeats: "您的 20 個座位",
    saved: "已儲存",
    savedBody: "AAFE 將在列印名牌前確認姓名。您可以隨時返回此連結。",
    backSeats: "返回座位清單",
    contribution: "您的贊助款項",
    paidOf: (paid: string, total: string) => `已付 ${paid}，共 ${total}`,
    balance: "餘額",
    howToPay: "付款方式",
    payOnline: "網上付款",
    mailCheck:
      "或將支票郵寄至 AAFE，111 Division St, New York, NY 10002（示範）",
    seePayments: "查看付款紀錄",
    paymentsTitle: "已收款項",
    paymentStatus: {
      paid: "已全額付清",
      partial: "部分付款",
      pledged: "已承諾 — 尚未收到款項",
      comp: "免費招待",
    },
    noPayments: "尚未收到款項。如有疑問，請聯絡 AAFE 晚宴團隊。",
    payNote: "為保障您的安全，此處不顯示付款詳情。",
    doors: "入場",
    program: "節目開始",
    dressCode: "穿著要求",
    dressValue: "雞尾酒會服裝",
    activityLink: "活動紀錄",
    activityTitle: "活動紀錄",
    activityHelp: "每項變更都會記錄日期和時間。",
    actorYou: "您",
    actorAafe: "AAFE 晚宴團隊",
    actOrder: "贊助已登記",
    actLink: "專屬賓客名單連結已傳送",
    actLogo: "活動標誌用標誌已上傳",
    actPayment: (amount: string) => `已收到款項：${amount}`,
    actAdded: (name: string, seat: number) => `${name} 已加入座位 ${seat}`,
    actBulk: (count: number, from: number, to: number) =>
      `透過貼上名單新增了 ${count} 位賓客（座位 ${from}–${to}）`,
    actUpdated: (name: string, seat: number, fields: string) =>
      `${name} 資訊已更新（座位 ${seat}）：${fields}`,
    actReplaced: (oldName: string, newName: string, seat: number) =>
      `座位 ${seat}：${oldName} 已替換為 ${newName}`,
    actRemoved: (name: string, seat: number) => `${name} 已從座位 ${seat} 移除`,
    actConfirmed: (count: number) => `AAFE 已確認 ${count} 位賓客的名牌姓名`,
    fieldNames: {
      first: "名字",
      last: "姓氏",
      title: "職稱",
      organization: "機構",
      email: "電子郵件",
      dietary: "飲食需求",
      accessibility: "無障礙需求",
    },
    listSep: "、",
    dietaryLabel: "飲食需求",
    accessLabel: "無障礙需求",
    lastUpdated: "最後更新",
    validation: {
      required: "必填",
      invalidEmail: "請輸入有效的電子郵件地址",
    },
  },
  ES: {
    welcome: "Bienvenido, Harborline Community Bank",
    subtitle: "Patrocinador Platino · Gala AAFE · 20 de mayo de 2027",
    yourGuests: "Sus invitados",
    needNames: (count: number) => `Aún faltan ${count} nombres`,
    allNamed: "Los 20 invitados tienen nombre ✓",
    named: "con nombre",
    due: "Añada los nombres antes del 23 de abril de 2027",
    addGuests: "Añadir invitados",
    seeSeats: "Ver sus 20 asientos",
    emptySeatNeedsGuest: "Este asiento necesita un invitado",
    nameThisGuest: "Asignar nombre al invitado",
    galaNightOption: "Noche de gala",
    arrived: "presentes",
    arrivedSummary: (arrived: number, total: number) =>
      `${arrived} de ${total} invitados han llegado`,
    arrivedAt: (time: string) => `✓ Llegó a las ${time}`,
    notArrived: "Aún no ha llegado",
    questions: "¿Preguntas o cambios?",
    textSize: {
      group: "Tamaño del texto",
      smaller: "Texto más pequeño",
      default: "Tamaño de texto predeterminado",
      larger: "Texto más grande",
    },
    logo: {
      uploadAria: "Subir su logotipo",
      changeAria: "Cambiar su logotipo",
      addLabel: "Añada su logotipo",
      needed: "Necesario para letreros · antes del 23 de abril",
      received: "Logotipo recibido",
      change: "Cambiar",
      title: "Subir su logotipo",
      drop: "Arrastre su logotipo aquí o elija un archivo",
      requirements:
        "PNG o SVG, fondo transparente, al menos 1000 px de ancho.",
      signTitle: "Gracias a nuestros patrocinadores",
      wallJoined: "✓ Harborline está en el muro de patrocinadores",
      use: "Usar este logotipo",
      chooseAnother: "Elegir otro",
      done: "Listo",
    },
    privateLink:
      "Este es su enlace privado — no lo reenvíe. No necesita contraseña.",
    privacyDetails:
      "La información de los invitados se usa únicamente para preparar la Gala AAFE (credenciales, asientos y registro) y se maneja de acuerdo con las prácticas de datos de AAFE. Este prototipo usa datos de demostración ficticios.",
    expiredOption: "Enlace vencido",
    expiredTitle: "Este enlace no es válido o ha vencido",
    expiredBody:
      "Comuníquese con el equipo de la Gala AAFE para obtener un enlace nuevo.",
    how: "¿Cómo desea añadir invitados?",
    paste: "Pegar una lista",
    pasteDesc:
      "Pegue nombres desde un correo o una hoja de cálculo. Los ordenaremos por usted.",
    oneByOne: "Añadir uno por uno",
    oneDesc: "Complete los datos de cada invitado.",
    yourSeats: "Sus 20 asientos",
    saved: "Guardado",
    savedBody:
      "AAFE confirmará los nombres antes de imprimir las credenciales. Puede volver a este enlace en cualquier momento.",
    backSeats: "Volver a sus asientos",
    contribution: "Su contribución",
    paidOf: (paid: string, total: string) => `${paid} pagado de ${total}`,
    balance: "Saldo pendiente",
    howToPay: "Cómo pagar",
    payOnline: "Pagar en línea",
    mailCheck:
      "O envíe un cheque a AAFE, 111 Division St, New York, NY 10002 (demostración)",
    seePayments: "Ver pagos",
    paymentsTitle: "Pagos recibidos",
    paymentStatus: {
      paid: "Pagado en su totalidad",
      partial: "Pago parcial",
      pledged: "Comprometido — pago aún no recibido",
      comp: "Cortesía",
    },
    noPayments:
      "Aún no se ha recibido ningún pago. ¿Preguntas? Escriba al equipo de la Gala AAFE.",
    payNote: "Por su seguridad, aquí no se muestran los datos de pago.",
    doors: "Puertas",
    program: "Programa",
    dressCode: "Código de vestimenta",
    dressValue: "Cóctel",
    activityLink: "Actividad",
    activityTitle: "Actividad",
    activityHelp: "Cada cambio se guarda con fecha y hora.",
    actorYou: "Usted",
    actorAafe: "Equipo de la Gala AAFE",
    actOrder: "Patrocinio registrado",
    actLink: "Enlace privado enviado por correo",
    actLogo: "Logotipo para letreros subido",
    actPayment: (amount: string) => `Pago recibido: ${amount}`,
    actAdded: (name: string, seat: number) =>
      `${name} añadido/a al asiento ${seat}`,
    actBulk: (count: number, from: number, to: number) =>
      `${count} invitados añadidos desde una lista pegada (asientos ${from}–${to})`,
    actUpdated: (name: string, seat: number, fields: string) =>
      `${name} actualizado/a (asiento ${seat}): ${fields}`,
    actReplaced: (oldName: string, newName: string, seat: number) =>
      `${oldName} sustituido/a por ${newName} (asiento ${seat})`,
    actRemoved: (name: string, seat: number) =>
      `${name} quitado/a del asiento ${seat}`,
    actConfirmed: (count: number) =>
      `AAFE confirmó ${count} nombres para las credenciales`,
    fieldNames: {
      first: "nombre",
      last: "apellido",
      title: "cargo",
      organization: "organización",
      email: "correo electrónico",
      dietary: "necesidades alimentarias",
      accessibility: "necesidades de accesibilidad",
    },
    listSep: ", ",
    dietaryLabel: "Necesidades alimentarias",
    accessLabel: "Necesidades de accesibilidad",
    lastUpdated: "Última actualización",
    validation: {
      required: "Obligatorio",
      invalidEmail: "Ingrese un correo electrónico válido",
    },
  },
  한국어: {
    welcome: "환영합니다, Harborline Community Bank",
    subtitle: "플래티넘 후원사 · AAFE 갈라 · 2027년 5월 20일",
    yourGuests: "게스트",
    needNames: (count: number) => `아직 ${count}명의 이름이 필요합니다`,
    allNamed: "20명의 이름이 모두 입력되었습니다 ✓",
    named: "이름 입력",
    due: "2027년 4월 23일까지 이름을 추가해 주세요",
    addGuests: "게스트 추가",
    seeSeats: "20개 좌석 보기",
    emptySeatNeedsGuest: "이 좌석에 게스트가 필요합니다",
    nameThisGuest: "게스트 이름 입력",
    galaNightOption: "갈라 당일",
    arrived: "도착",
    arrivedSummary: (arrived: number, total: number) =>
      `게스트 ${total}명 중 ${arrived}명 도착`,
    arrivedAt: (time: string) => `✓ ${time} 도착`,
    notArrived: "아직 도착하지 않음",
    questions: "문의 또는 변경 사항이 있나요?",
    textSize: {
      group: "텍스트 크기",
      smaller: "텍스트 작게",
      default: "기본 텍스트 크기",
      larger: "텍스트 크게",
    },
    logo: {
      uploadAria: "로고 업로드",
      changeAria: "로고 변경",
      addLabel: "로고 추가",
      needed: "행사 표지판에 필요 · 4월 23일까지",
      received: "로고 접수 완료",
      change: "변경",
      title: "로고 업로드",
      drop: "로고를 여기로 드래그하거나 파일을 선택하세요",
      requirements: "PNG 또는 SVG, 투명 배경, 너비 최소 1000px.",
      signTitle: "후원사 여러분께 감사드립니다",
      wallJoined: "✓ Harborline이 후원사 월에 추가되었습니다",
      use: "이 로고 사용",
      chooseAnother: "다른 파일 선택",
      done: "완료",
    },
    privateLink:
      "이 링크는 전용 링크입니다 — 전달하지 마세요. 비밀번호는 필요하지 않습니다.",
    privacyDetails:
      "게스트 정보는 AAFE 갈라 준비(명찰, 좌석 배치, 체크인)에만 사용되며 AAFE의 데이터 처리 방침에 따라 관리됩니다. 이 프로토타입은 가상의 데모 데이터를 사용합니다.",
    expiredOption: "만료된 링크",
    expiredTitle: "이 링크가 유효하지 않거나 만료되었습니다",
    expiredBody: "새 링크를 받으려면 AAFE 갈라 팀에 문의해 주세요.",
    how: "게스트를 어떻게 추가하시겠어요?",
    paste: "명단 붙여넣기",
    pasteDesc:
      "이메일이나 스프레드시트에서 이름을 붙여넣으세요. 좌석별로 정리해 드립니다.",
    oneByOne: "한 명씩 추가",
    oneDesc: "각 게스트의 정보를 직접 입력하세요.",
    yourSeats: "20개 좌석",
    saved: "저장됨",
    savedBody:
      "AAFE가 명찰 인쇄 전 이름을 확인합니다. 언제든 이 링크로 돌아올 수 있습니다.",
    backSeats: "좌석으로 돌아가기",
    contribution: "후원 금액",
    paidOf: (paid: string, total: string) => `${total} 중 ${paid} 납부`,
    balance: "잔액",
    howToPay: "납부 방법",
    payOnline: "온라인 납부",
    mailCheck:
      "또는 AAFE, 111 Division St, New York, NY 10002로 수표를 우편 발송하세요(데모)",
    seePayments: "납부 내역 보기",
    paymentsTitle: "납부 내역",
    paymentStatus: {
      paid: "전액 납부 완료",
      partial: "일부 납부",
      pledged: "약정됨 — 아직 납부 전",
      comp: "무료 초대",
    },
    noPayments:
      "아직 납부된 금액이 없습니다. 문의사항은 AAFE 갈라 팀에 연락해 주세요.",
    payNote: "보안을 위해 결제 정보는 여기에 표시되지 않습니다.",
    doors: "입장",
    program: "프로그램",
    dressCode: "드레스 코드",
    dressValue: "칵테일 복장",
    activityLink: "활동 기록",
    activityTitle: "활동 기록",
    activityHelp: "모든 변경 사항은 날짜와 시간과 함께 저장됩니다.",
    actorYou: "본인",
    actorAafe: "AAFE 갈라 팀",
    actOrder: "후원 등록됨",
    actLink: "전용 게스트 명단 링크 발송됨",
    actLogo: "행사 표지판용 로고 업로드됨",
    actPayment: (amount: string) => `납부 확인: ${amount}`,
    actAdded: (name: string, seat: number) =>
      `${name} 님이 ${seat}번 좌석에 추가됨`,
    actBulk: (count: number, from: number, to: number) =>
      `붙여넣은 명단에서 ${count}명 추가 (${from}–${to}번 좌석)`,
    actUpdated: (name: string, seat: number, fields: string) =>
      `${name} 님 정보 수정 (${seat}번 좌석): ${fields}`,
    actReplaced: (oldName: string, newName: string, seat: number) =>
      `${seat}번 좌석: ${oldName} 님 → ${newName} 님`,
    actRemoved: (name: string, seat: number) =>
      `${name} 님이 ${seat}번 좌석에서 삭제됨`,
    actConfirmed: (count: number) => `AAFE가 명찰용 이름 ${count}개를 확인함`,
    fieldNames: {
      first: "이름",
      last: "성",
      title: "직함",
      organization: "소속",
      email: "이메일",
      dietary: "식이 요구사항",
      accessibility: "접근성 요구사항",
    },
    listSep: ", ",
    dietaryLabel: "식이 요구사항",
    accessLabel: "접근성 요구사항",
    lastUpdated: "마지막 수정",
    validation: {
      required: "필수 항목입니다",
      invalidEmail: "유효한 이메일 주소를 입력하세요",
    },
  },
}

function Icon({ name, size = 24 }: IconProps) {
  const paths: Record<string, React.ReactNode> = {
    arrow: (
      <>
        <path d="m15 18-6-6 6-6" />
        <path d="M9 12h12" />
      </>
    ),
    calendar: (
      <>
        <path d="M8 2v4M16 2v4M3 10h18" />
        <rect x="3" y="4" width="18" height="18" rx="3" />
        <path d="M8 15h.01M12 15h.01M16 15h.01" />
      </>
    ),
    clipboard: (
      <>
        <rect x="5" y="4" width="14" height="17" rx="3" />
        <path d="M9 4.5V3h6v1.5M9 10h6M9 14h4" />
        <path d="m18 7 1-2 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z" />
      </>
    ),
    person: (
      <>
        <circle cx="9" cy="8" r="4" />
        <path d="M2 21c0-4 3-7 7-7 2 0 3.5.5 4.7 1.5M19 14v7M15.5 17.5h7" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    check: <path d="m5 12 4 4L19 6" />,
    sparkle: (
      <>
        <path d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3L12 3Z" />
        <path d="m19 14 .8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z" />
      </>
    ),
    mail: (
      <>
        <rect x="2" y="4" width="20" height="16" rx="3" />
        <path d="m3 6 9 7 9-7" />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12M18 6 6 18" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4.5 3.6-8 8-8s8 3.5 8 8" />
      </>
    ),
    camera: (
      <>
        <path d="M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
        <circle cx="12" cy="13" r="4" />
      </>
    ),
    pencil: (
      <>
        <path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" />
        <path d="m14 7 3 3" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="4" />
        <path d="M2 21c0-4 3-7 7-7s7 3 7 7M16 4a4 4 0 0 1 0 8M17 15c3 0 5 2 5 5" />
      </>
    ),
    badge: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="3" />
        <circle cx="12" cy="9" r="3" />
        <path d="M8 17c.7-2 2-3 4-3s3.3 1 4 3" />
      </>
    ),
    phone: (
      <>
        <path d="M7 3h3l1 5-2 1c1 3 3 5 6 6l1-2 5 1v3c0 2-2 4-4 4C9 20 4 15 3 7c0-2 2-4 4-4Z" />
      </>
    ),
    undo: (
      <>
        <path d="M9 7 4 12l5 5" />
        <path d="M5 12h8a7 7 0 0 1 7 7" />
      </>
    ),
    redo: (
      <>
        <path d="m15 7 5 5-5 5" />
        <path d="M19 12h-8a7 7 0 0 0-7 7" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m-4-4 4 4 4-4" />
        <path d="M4 19h16" />
      </>
    ),
    grip: (
      <>
        <circle cx="8" cy="7" r="1" fill="currentColor" stroke="none" />
        <circle cx="16" cy="7" r="1" fill="currentColor" stroke="none" />
        <circle cx="8" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="16" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="8" cy="17" r="1" fill="currentColor" stroke="none" />
        <circle cx="16" cy="17" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    lock: (
      <>
        <rect x="4" y="10" width="16" height="11" rx="3" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    warning: (
      <>
        <path d="M12 3 2.5 20h19L12 3Z" />
        <path d="M12 9v5m0 3h.01" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c3 3 4 6 4 9s-1 6-4 9c-3-3-4-6-4-9s1-6 4-9Z" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    shirt: (
      <path d="M8 3 3 6l2 4 2-1v12h10V9l2 1 2-4-5-3c-.6 1.7-2.2 3-4 3S8.6 4.7 8 3Z" />
    ),
    receipt: (
      <>
        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
        <path d="M9 8h6M9 12h6M9 16h3" />
      </>
    ),
    mapPin: (
      <>
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4m-4 4 4-4 4 4" />
        <path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
      </>
    ),
  }
  return (
    <svg
      aria-hidden="true"
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  )
}

function Logo({ inverse = false, compact = false }: LogoProps) {
  if (!compact) {
    return (
      <AafeLogo
        height={48}
        className={inverse ? "aafe-logo--white" : ""}
      />
    )
  }

  return (
    <div className="logo compact" aria-label="AAFE">
      <img src={aafeMarkOrange} alt="" />
    </div>
  )
}

function Button({
  children,
  variant = "primary",
  onClick,
  type = "button",
  className = "",
}: {
  children: React.ReactNode
  variant?: "primary" | "secondary" | "ghost" | "danger"
  onClick?: () => void
  type?: "button" | "submit"
  className?: string
}) {
  return (
    <button
      className={`button ${variant} ${className}`}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  )
}

function TopBar({
  language,
  setLanguage,
  textScale,
  onTextScale,
  onHome,
}: {
  language: Language
  setLanguage: (language: Language) => void
  textScale: TextScale
  onTextScale: (scale: TextScale, ownerWindow: Window | null) => void
  onHome: () => void
}) {
  const [languageOpen, setLanguageOpen] = useState(false)
  const [textSizeOpen, setTextSizeOpen] = useState(false)
  const textSizeLabels = translations[language].textSize
  const textSizes: { value: TextScale; label: string; ariaLabel: string }[] = [
    { value: 1, label: "A−", ariaLabel: textSizeLabels.smaller },
    { value: 1.125, label: "A", ariaLabel: textSizeLabels.default },
    { value: 1.25, label: "A+", ariaLabel: textSizeLabels.larger },
  ]
  const languageNames: LanguageOption[] = [
    { code: "EN", label: "English" },
    { code: "中文", label: "中文" },
    { code: "ES", label: "Español" },
    { code: "한국어", label: "한국어" },
  ]
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <button
          className="product-logo-button portal-logo-button"
          onClick={onHome}
          aria-label="Back to home"
          title="Home"
        >
          <AafeLogo height={44} />
        </button>
        <div className="topbar-controls">
          <div className="text-size-menu-wrap">
            <button
              className="text-size-button"
              type="button"
              aria-label={textSizeLabels.group}
              aria-expanded={textSizeOpen}
              onClick={() => {
                setTextSizeOpen(!textSizeOpen)
                setLanguageOpen(false)
              }}
            >
              Aa
            </button>
            {textSizeOpen && (
              <>
                <button
                  className="text-size-scrim"
                  onClick={() => setTextSizeOpen(false)}
                  aria-label={textSizeLabels.group}
                />
                <div
                  className="text-size-menu"
                  role="menu"
                  aria-label={textSizeLabels.group}
                >
                  {textSizes.map((size) => (
                    <button
                      key={size.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={textScale === size.value}
                      className={textScale === size.value ? "active" : ""}
                      onClick={(event) => {
                        onTextScale(
                          size.value,
                          event.currentTarget.ownerDocument.defaultView,
                        )
                        setTextSizeOpen(false)
                      }}
                    >
                      <span className="text-size-sample">{size.label}</span>
                      <span>{size.ariaLabel}</span>
                      {textScale === size.value && (
                        <Icon name="check" size={17} />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="language-menu-wrap">
            <button
              className="language-button"
              onClick={() => {
                setLanguageOpen(!languageOpen)
                setTextSizeOpen(false)
              }}
              aria-expanded={languageOpen}
            >
              <Icon name="globe" size={18} />
              <span>{language}</span>
            </button>
            {languageOpen && (
              <>
                <button
                  className="language-scrim"
                  onClick={() => setLanguageOpen(false)}
                  aria-label="Close language menu"
                />
                <div
                  className="language-sheet"
                  role="dialog"
                  aria-label="Choose language"
                >
                  <div className="language-sheet-handle" />
                  <p>Language</p>
                  {languageNames.map((item) => (
                    <button
                      key={item.code}
                      className={language === item.code ? "active" : ""}
                      onClick={() => {
                        setLanguage(item.code)
                        setLanguageOpen(false)
                      }}
                    >
                      <span>{item.label}</span>
                      {language === item.code && (
                        <Icon name="check" size={18} />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="back-button" onClick={onClick} aria-label="Go back">
      <Icon name="arrow" size={22} /> Back
    </button>
  )
}

function ProgressRing({
  named,
  total,
  label,
}: {
  named: number
  total: number
  label: string
}) {
  const circumference = 314
  const progress = total ? named / total : 0
  return (
    <div
      className="progress-ring"
      aria-label={`${named} of ${total} guests ${label}`}
    >
      <svg viewBox="0 0 120 120">
        <circle className="track" cx="60" cy="60" r="50" />
        <circle
          className="value"
          cx="60"
          cy="60"
          r="50"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - circumference * progress}
        />
      </svg>
      <div>
        <strong>
          {named} / {total}
        </strong>
        <span>{label}</span>
      </div>
    </div>
  )
}

function StatusChip({ status }: { status: GuestStatus | "changed" }) {
  const text = {
    confirmed: "Confirmed",
    waiting: "Waiting review",
    empty: "Empty",
    changed: "Changed",
  }[status]
  return (
    <span className={`status-chip ${status}`}>
      <span className="status-dot">
        {status === "confirmed"
          ? "✓"
          : status === "waiting"
            ? "!"
            : status === "changed"
              ? "↻"
              : "—"}
      </span>
      {text}
    </span>
  )
}

type Dict = typeof translations.EN

const CONTACT_EMAIL = "gala-team@aafe-demo.example.org"
const CONTACT_PHONE = "(212) 555-0100"
const TEXT_SCALE_STORAGE_KEY = "aafe-sponsor-text-scale"

function ContactBlock({ t }: { t: Dict }) {
  return (
    <div className="contact-block">
      <strong>{t.questions}</strong>
      <div className="contact-links">
        <a href={`mailto:${CONTACT_EMAIL}`}>
          <Icon name="mail" size={16} />
          {CONTACT_EMAIL}
        </a>
        <a href="tel:+12125550100">
          <Icon name="phone" size={16} />
          {CONTACT_PHONE}
        </a>
      </div>
    </div>
  )
}

function activityText(t: Dict, language: Language, a: Activity) {
  const fields = (a.fields || [])
    .map((field) => t.fieldNames[field])
    .join(t.listSep)
  switch (a.kind) {
    case "orderRecorded":
      return t.actOrder
    case "linkSent":
      return t.actLink
    case "logoUploaded":
      return t.actLogo
    case "payment":
      return t.actPayment(fmtMoney(language, a.amount || 0))
    case "added":
      return t.actAdded(a.name || "", a.seat || 0)
    case "bulkAdded":
      return t.actBulk(a.count || 0, a.seats?.[0] || 0, a.seats?.[1] || 0)
    case "updated":
      return t.actUpdated(a.name || "", a.seat || 0, fields)
    case "replaced":
      return t.actReplaced(a.previousName || "", a.name || "", a.seat || 0)
    case "removed":
      return t.actRemoved(a.name || "", a.seat || 0)
    case "confirmed":
      return t.actConfirmed(a.count || 0)
  }
}

const activityMark: Record<ActivityKind, string> = {
  orderRecorded: "★",
  payment: "$",
  linkSent: "✉",
  logoUploaded: "✓",
  added: "+",
  bulkAdded: "+",
  updated: "↻",
  replaced: "⇄",
  removed: "−",
  confirmed: "✓",
}

function ContributionCard({
  t,
  language,
  onOpen,
}: {
  t: Dict
  language: Language
  onOpen: () => void
}) {
  const { paid, balance, status } = contributionSummary(CONTRIBUTION)
  const pct = CONTRIBUTION.commitment
    ? Math.min(100, Math.round((paid / CONTRIBUTION.commitment) * 100))
    : 100
  return (
    <section
      className="glass-card contribution-card"
      aria-labelledby="contribution-title"
    >
      <div className="contribution-head">
        <h2 id="contribution-title">{t.contribution}</h2>
        <span className={`pay-chip ${status}`}>{t.paymentStatus[status]}</span>
      </div>
      {status === "comp" ? (
        <p className="contribution-amount">{t.paymentStatus.comp}</p>
      ) : (
        <>
          <p className="contribution-amount" data-testid="amount-paid">
            {t.paidOf(
              fmtMoney(language, paid),
              fmtMoney(language, CONTRIBUTION.commitment),
            )}
          </p>
          <div
            className="contribution-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label={t.contribution}
          >
            <span style={{ width: `${pct}%` }} />
          </div>
        </>
      )}
      <div className="contribution-foot">
        {status !== "comp" && (
          <span>
            {t.balance}: <strong>{fmtMoney(language, balance)}</strong>
          </span>
        )}
        <button className="text-link" onClick={onOpen}>
          {t.seePayments}
          <Icon name="chevron" size={16} />
        </button>
      </div>
      {status !== "paid" && status !== "comp" && (
        <div className="contribution-payment-options">
          <h3>{t.howToPay}</h3>
          <a
            className="button primary contribution-pay-button"
            href="https://www.aafe.org/donate/"
            target="_blank"
            rel="noreferrer"
          >
            {t.payOnline}
          </a>
          <p>{t.mailCheck}</p>
        </div>
      )}
    </section>
  )
}

function Home({
  go,
  t,
  language,
  activity,
  guests,
  galaNight,
  sponsorLogo,
  onLogoSaved,
}: {
  go: (screen: Screen) => void
  t: Dict
  language: Language
  activity: Activity[]
  guests: Guest[]
  galaNight: boolean
  sponsorLogo: string
  onLogoSaved: (logoUrl: string) => void
}) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const [paymentsOpen, setPaymentsOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [logoFile, setLogoFile] = useState<{
    name: string
    url: string
  } | null>(null)
  const [logoOnWall, setLogoOnWall] = useState(false)
  const [joiningWall, setJoiningWall] = useState(false)
  const [wallJoined, setWallJoined] = useState(false)
  const logoFileInputRef = useRef<HTMLInputElement>(null)
  const logoFlightRef = useRef<HTMLImageElement>(null)
  const wallLogoRef = useRef<HTMLImageElement>(null)
  const wallSlotRef = useRef<HTMLDivElement>(null)
  const chooseLogoFile = (file: File | undefined, ownerWindow: Window | null) => {
    if (!file || !ownerWindow) return
    const url = ownerWindow.URL.createObjectURL(file)
    setLogoFile((current) => {
      if (current) ownerWindow.URL.revokeObjectURL(current.url)
      return { name: file.name, url }
    })
    setLogoOnWall(false)
    setJoiningWall(false)
    setWallJoined(false)
  }
  const closeLogoUpload = (ownerWindow: Window | null) => {
    if (joiningWall) return
    if (logoFile && !wallJoined && ownerWindow) {
      ownerWindow.URL.revokeObjectURL(logoFile.url)
    }
    setLogoFile(null)
    setLogoOnWall(false)
    setWallJoined(false)
    setUploadOpen(false)
  }
  const joinSponsorWall = async () => {
    if (!logoFile || joiningWall || wallJoined) return
    const source = logoFlightRef.current
    const ownerWindow = source?.ownerDocument.defaultView
    if (!source || !ownerWindow) return
    const first = source.getBoundingClientRect()
    const reduceMotion = ownerWindow.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches

    setJoiningWall(true)
    setLogoOnWall(true)
    await new Promise<void>((resolve) =>
      ownerWindow.requestAnimationFrame(() => resolve()),
    )

    const target = wallLogoRef.current
    const slot = wallSlotRef.current
    if (target && slot) {
      target.style.opacity = "1"
      if (!reduceMotion) {
        const last = target.getBoundingClientRect()
        const translateX =
          first.left + first.width / 2 - (last.left + last.width / 2)
        const translateY =
          first.top + first.height / 2 - (last.top + last.height / 2)
        const scale = Math.min(first.width / last.width, first.height / last.height)
        try {
          await target
            .animate(
              [
                {
                  transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
                  transformOrigin: "center",
                },
                { transform: "translate(0, 0) scale(1)" },
              ],
              {
                duration: 700,
                easing: "cubic-bezier(.2,.8,.2,1.1)",
              },
            )
            .finished
        } catch {}
        try {
          await slot
            .animate(
              [
                {
                  boxShadow:
                    "0 0 0 0 rgb(from var(--orange) r g b / 0)",
                },
                {
                  boxShadow:
                    "0 0 0 7px rgb(from var(--orange) r g b / .28)",
                  offset: 0.45,
                },
                {
                  boxShadow:
                    "0 0 0 12px rgb(from var(--orange) r g b / 0)",
                },
              ],
              { duration: 500, easing: "ease-out" },
            )
            .finished
        } catch {}
      }
    }

    onLogoSaved(logoFile.url)
    setWallJoined(true)
    setJoiningWall(false)
  }
  const totalGuests = guests.length
  const namedGuests = guests.filter(
    (guest) =>
      guest.status !== "empty" && Boolean(`${guest.first}${guest.last}`.trim()),
  ).length
  const missingGuests = totalGuests - namedGuests
  const allNamed = missingGuests === 0
  const arrivedGuests = guests.filter(
    (guest) =>
      guest.status === "confirmed" && Boolean(GALA_ARRIVAL_TIMES[guest.seat]),
  ).length
  return (
    <>
      <main className="page home-page">
        <section className="intro">
          <p className="eyebrow">Sponsor portal</p>
          <span className="signature-bar" aria-hidden="true" />
          <div className="sponsor-identity">
            <div className="sponsor-logo-area">
              <button
                className={`sponsor-logo-tile ${sponsorLogo ? "uploaded" : "missing"}`}
                type="button"
                aria-label={
                  sponsorLogo ? t.logo.changeAria : t.logo.uploadAria
                }
                onClick={() => setUploadOpen(true)}
              >
                {sponsorLogo ? (
                  <img src={sponsorLogo} alt="" />
                ) : (
                  <span className="sponsor-logo-empty">
                    <Icon name="upload" size={23} />
                    <span>{t.logo.addLabel}</span>
                  </span>
                )}
              </button>
              {sponsorLogo ? (
                <div className="sponsor-logo-status received">
                  <span>✓ {t.logo.received}</span>
                  <button type="button" onClick={() => setUploadOpen(true)}>
                    {t.logo.change}
                  </button>
                </div>
              ) : (
                <div className="sponsor-logo-status needed">
                  <Icon name="warning" size={14} />
                  <span>{t.logo.needed}</span>
                </div>
              )}
            </div>
            <div className="sponsor-identity-copy">
              <h1>{t.welcome}</h1>
              <p className="subtitle">{t.subtitle}</p>
            </div>
          </div>
        </section>
        <section className="glass-card guests-card">
          <h2 className="guests-card-title">{t.yourGuests}</h2>
          <div className="guest-progress-area">
            <ProgressRing
              named={galaNight ? arrivedGuests : namedGuests}
              total={galaNight ? namedGuests : totalGuests}
              label={galaNight ? t.arrived : t.named}
            />
            <div className="progress-copy">
              <h3 className={allNamed ? "all-named" : ""}>
                {galaNight
                  ? t.arrivedSummary(arrivedGuests, namedGuests)
                  : allNamed
                    ? t.allNamed
                    : t.needNames(missingGuests)}
              </h3>
              {!galaNight && (
                <p>
                  <Icon name="calendar" size={20} />
                  {t.due}
                </p>
              )}
            </div>
          </div>
          <div className="guest-card-actions">
            <Button
              variant={allNamed ? "secondary" : "primary"}
              onClick={() => go("choose")}
            >
              {t.addGuests}
              <Icon name="chevron" size={20} />
            </Button>
            <Button
              variant={allNamed ? "primary" : "secondary"}
              onClick={() => go("seats")}
            >
              {t.seeSeats}
            </Button>
          </div>
        </section>
        <section className="glass-card event-details-card">
          <span className="event-detail-icon">
            <Icon name="calendar" size={20} />
          </span>
          <div>
            <strong>{fmtDate(language, EVENT.doors, "full")}</strong>
            <small>
              <Icon name="clock" size={15} />
              {t.doors} {fmtDate(language, EVENT.doors, "time")} · {t.program}{" "}
              {fmtDate(language, EVENT.program, "time")}
            </small>
            <span>{EVENT.venue}</span>
            <small>
              <Icon name="mapPin" size={15} />
              {EVENT.address}
            </small>
            <small>
              <Icon name="shirt" size={15} />
              {t.dressCode}: {t.dressValue}
            </small>
          </div>
        </section>
        <ContributionCard
          t={t}
          language={language}
          onOpen={() => setPaymentsOpen(true)}
        />
        <div className="home-trust">
          <ContactBlock t={t} />
          <p className="private-link-note">{t.privateLink}</p>
          <button className="history-link" onClick={() => setHistoryOpen(true)}>
            {t.activityLink}
          </button>
        </div>
        <p className="home-privacy-note">{t.privacyDetails}</p>
      </main>
      {historyOpen && (
        <div
          className="sheet-scrim"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setHistoryOpen(false)
          }
        >
          <section
            className="bottom-sheet portal-mini-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-title"
          >
            <div className="sheet-handle" />
            <button
              className="sheet-close"
              onClick={() => setHistoryOpen(false)}
              aria-label="Close"
            >
              <Icon name="close" size={20} />
            </button>
            <h2 id="history-title">{t.activityTitle}</h2>
            <p className="sheet-description">{t.activityHelp}</p>
            <ol className="history-list activity-list" data-testid="activity">
              {[...activity].reverse().map((a) => (
                <li key={a.id}>
                  <span className={`history-mark ${a.kind}`} aria-hidden="true">
                    {activityMark[a.kind]}
                  </span>
                  <span>
                    <strong>{activityText(t, language, a)}</strong>
                    <small>
                      {a.actor === "you" ? t.actorYou : t.actorAafe} ·{" "}
                      <time dateTime={a.at}>
                        {fmtDate(language, a.at, "dateTime")}
                      </time>
                    </small>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
      {paymentsOpen && (
        <div
          className="sheet-scrim"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setPaymentsOpen(false)
          }
        >
          <section
            className="bottom-sheet portal-mini-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payments-title"
          >
            <div className="sheet-handle" />
            <button
              className="sheet-close"
              onClick={() => setPaymentsOpen(false)}
              aria-label="Close"
            >
              <Icon name="close" size={20} />
            </button>
            <h2 id="payments-title">{t.paymentsTitle}</h2>
            {CONTRIBUTION.payments.length ? (
              <ul className="payments-list">
                {CONTRIBUTION.payments.map((p) => (
                  <li key={p.date}>
                    <span className="history-mark payment" aria-hidden="true">
                      <Icon name="receipt" size={16} />
                    </span>
                    <time dateTime={p.date}>{fmtDate(language, p.date)}</time>
                    <strong>{fmtMoney(language, p.amount)}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sheet-description">{t.noPayments}</p>
            )}
            <p className="pay-note">
              <Icon name="lock" size={14} />
              {t.payNote}
            </p>
          </section>
        </div>
      )}
      {uploadOpen && (
        <div
          className="sheet-scrim"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeLogoUpload(event.currentTarget.ownerDocument.defaultView)
            }
          }}
        >
          <section
            className="bottom-sheet portal-mini-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-title"
          >
            <div className="sheet-handle" />
            <button
              className="sheet-close"
              onClick={(event) =>
                closeLogoUpload(event.currentTarget.ownerDocument.defaultView)
              }
              aria-label="Close"
            >
              <Icon name="close" size={20} />
            </button>
            <h2 id="upload-title">{t.logo.title}</h2>
            <input
              id="sponsor-logo-file"
              ref={logoFileInputRef}
              className="logo-file-input"
              type="file"
              accept=".png,.svg,image/png,image/svg+xml"
              onChange={(event) => {
                chooseLogoFile(
                  event.currentTarget.files?.[0],
                  event.currentTarget.ownerDocument.defaultView,
                )
                event.currentTarget.value = ""
              }}
            />
            {logoFile ? (
              <>
                {!logoOnWall && (
                  <div className="logo-flight-preview" aria-hidden="true">
                    <img ref={logoFlightRef} src={logoFile.url} alt="" />
                  </div>
                )}
                <div className="sponsor-wall" aria-label={t.logo.signTitle}>
                  <div className="sponsor-wall-heading">
                    <AafeMark className="sponsor-wall-mark" />
                    <strong>{t.logo.signTitle}</strong>
                  </div>
                  <div className="sponsor-wall-grid">
                    {[0, 1, 2, 3, 4, 5].map((slotIndex) =>
                      slotIndex === 1 ? (
                        <div
                          key={slotIndex}
                          ref={wallSlotRef}
                          className={`sponsor-wall-slot target ${logoOnWall ? "filled" : ""}`}
                        >
                          {logoOnWall && (
                            <img
                              ref={wallLogoRef}
                              className={joiningWall ? "joining" : ""}
                              src={logoFile.url}
                              alt=""
                            />
                          )}
                        </div>
                      ) : (
                        <div
                          key={slotIndex}
                          className="sponsor-wall-slot placeholder"
                          aria-hidden="true"
                        />
                      ),
                    )}
                  </div>
                </div>
                {!joiningWall && !wallJoined && (
                  <>
                    <p className="logo-requirements">
                      {t.logo.requirements}
                    </p>
                    <div className="logo-upload-actions">
                      <Button onClick={joinSponsorWall}>{t.logo.use}</Button>
                      <Button
                        variant="secondary"
                        onClick={() => logoFileInputRef.current?.click()}
                      >
                        {t.logo.chooseAnother}
                      </Button>
                    </div>
                  </>
                )}
                {wallJoined && (
                  <>
                    <p className="sponsor-wall-success" role="status">
                      {t.logo.wallJoined}
                    </p>
                    <Button
                      onClick={() =>
                        closeLogoUpload(
                          wallSlotRef.current?.ownerDocument.defaultView || null,
                        )
                      }
                    >
                      {t.logo.done}
                    </Button>
                  </>
                )}
              </>
            ) : (
              <>
                <label
                  className="logo-dropzone"
                  htmlFor="sponsor-logo-file"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    chooseLogoFile(
                      event.dataTransfer.files[0],
                      event.currentTarget.ownerDocument.defaultView,
                    )
                  }}
                >
                  <Icon name="upload" size={28} />
                  <strong>{t.logo.drop}</strong>
                </label>
                <p className="logo-requirements">{t.logo.requirements}</p>
              </>
            )}
          </section>
        </div>
      )}
    </>
  )
}

function ExpiredLink({ t }: { t: Dict }) {
  return (
    <main className="page expired-page">
      <section className="glass-card expired-card">
        <span className="expired-icon" aria-hidden="true">
          <Icon name="lock" size={30} />
        </span>
        <h1>{t.expiredTitle}</h1>
        <p>{t.expiredBody}</p>
        <ContactBlock t={t} />
      </section>
    </main>
  )
}

function Choose({
  go,
  t,
}: {
  go: (screen: Screen) => void
  t: typeof translations.EN
}) {
  return (
    <main className="page">
      <BackButton onClick={() => go("home")} />
      <section className="screen-heading">
        <p className="eyebrow">Add guests</p>
        <h1>{t.how}</h1>
      </section>
      <div className="choice-list">
        <button className="glass-card choice-card" onClick={() => go("paste")}>
          <span className="choice-icon">
            <Icon name="clipboard" size={31} />
          </span>
          <span className="choice-copy">
            <strong>{t.paste}</strong>
            <small>{t.pasteDesc}</small>
          </span>
          <Icon name="chevron" size={24} />
        </button>
        <button className="glass-card choice-card" onClick={() => go("single")}>
          <span className="choice-icon">
            <Icon name="person" size={31} />
          </span>
          <span className="choice-copy">
            <strong>{t.oneByOne}</strong>
            <small>{t.oneDesc}</small>
          </span>
          <Icon name="chevron" size={24} />
        </button>
      </div>
      <p className="privacy-note">
        Your guest information is private and used only for the AAFE Gala.
      </p>
    </main>
  )
}

const parsedGuests = [
  {
    first: "Mei",
    last: "Chen",
    title: "VP, Commercial Banking",
    email: "mchen@harborline.com",
    check: false,
  },
  {
    first: "Jordan",
    last: "Williams",
    title: "Community Board Chair",
    email: "jordan.w@harborline.com",
    check: false,
  },
  {
    first: "Ana",
    last: "Torres",
    title: "Director, Client Services",
    email: "ana.torres@harborline.com",
    check: false,
  },
  {
    first: "Sam",
    last: "Cho",
    title: "Senior Manager",
    email: "sam.cho@harborline.com",
    check: true,
  },
  {
    first: "Priya",
    last: "Shah",
    title: "Community Partner",
    email: "priya.shah@harborline.com",
    check: false,
  },
  {
    first: "David",
    last: "Lin",
    title: "Guest",
    email: "dlin@harborline.com",
    check: true,
  },
]

function PasteList({
  go,
  onAdd,
}: {
  go: (screen: Screen) => void
  onAdd: () => void
}) {
  const [sorted, setSorted] = useState(false)
  const [pasteText, setPasteText] = useState("")
  return (
    <>
      <main className={`page ${sorted ? "has-sticky-action" : ""}`}>
        <BackButton onClick={() => go("choose")} />
        <section className="screen-heading compact">
          <p className="eyebrow">Quick add</p>
          <h1>Paste your guest list</h1>
          <p>Don’t worry about formatting—we’ll organize it.</p>
        </section>
        {!sorted ? (
          <section className="glass-card paste-card">
            <label htmlFor="guest-list">Guest names and details</label>
            <textarea
              id="guest-list"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={
                "Mei Chen, VP Commercial Banking\nmchen@harborline.com\n\nJordan Williams — Community Board Chair\njordan.w@harborline.com"
              }
            />
            <Button onClick={() => setSorted(true)}>
              <Icon name="sparkle" size={20} />
              Sort into seats
            </Button>
          </section>
        ) : (
          <section className="results-section">
            <div className="results-note">
              <Icon name="sparkle" size={20} />
              <span>
                <strong>We found 6 guests.</strong> Check them before saving.
              </span>
            </div>
            <div className="parsed-list">
              {parsedGuests.map((guest, index) => (
                <div
                  className={`glass-card parsed-row ${
                    guest.check ? "needs-check" : ""
                  }`}
                  key={guest.email}
                >
                  <div className="seat-number">{index + 13}</div>
                  <div className="parsed-fields">
                    <label className="parsed-field">
                      <span>Name</span>
                      <input
                        aria-label={`Guest ${index + 1} name`}
                        defaultValue={`${guest.first} ${guest.last}`}
                      />
                    </label>
                    <label className="parsed-field">
                      <span>Title</span>
                      <input
                        aria-label={`Guest ${index + 1} title`}
                        defaultValue={guest.title}
                      />
                    </label>
                    <label className="parsed-field">
                      <span>Email</span>
                      <input
                        aria-label={`Guest ${index + 1} email`}
                        defaultValue={guest.email}
                      />
                    </label>
                    {guest.check && (
                      <span className="check-hint">! Please check</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
      {sorted && (
        <div className="sticky-action">
          <div className="results-sticky-inner">
            <span>6 guests ready</span>
            <Button onClick={onAdd}>
              Add 6 guests
              <Icon name="chevron" size={20} />
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

function Field({
  label,
  required,
  value,
  onChange,
  type = "text",
  caption,
  error,
  inputRef,
}: {
  label: string
  required?: boolean
  value: string
  onChange: (value: string) => void
  type?: string
  caption?: string
  error?: string
  inputRef?: React.Ref<HTMLInputElement>
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required && <b aria-hidden="true"> *</b>}
      </span>
      <input
        ref={inputRef}
        required={required}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
      />
      {error && (
        <small className="field-error" role="alert">
          {error}
        </small>
      )}
      {caption && <small>{caption}</small>}
    </label>
  )
}

function BadgePreview({
  guest,
  seat,
  assigned,
}: {
  guest: Omit<Guest, "seat" | "status">
  seat: number
  assigned: boolean
}) {
  return (
    <div className="badge-wrap">
      <div className="badge-preview">
        <div className="badge-top">
          <Logo compact />
          <span>AAFE Annual Gala 2027</span>
        </div>
        <div className="badge-name">
          <strong>{guest.first || "First name"}</strong>
          <span>{guest.last || "Last name"}</span>
        </div>
        <div className="badge-details">
          <span>{guest.title || "Title"}</span>
          <span>{guest.organization || "Organization"}</span>
        </div>
        <div className="badge-table">
          {assigned ? (
            <span>Table: assigned by AAFE</span>
          ) : (
            <>
              <small>TABLE</small>
              <strong>{seat <= 20 ? "12" : "TBD"}</strong>
            </>
          )}
        </div>
      </div>
      <p>This is how the name badge will print.</p>
    </div>
  )
}

function SingleGuest({
  go,
  seat,
  editing,
  onSave,
  validationMessages,
}: {
  go: (screen: Screen) => void
  seat: number
  editing?: Guest
  onSave: (guest: Omit<Guest, "seat" | "status">) => void
  validationMessages: typeof translations.EN.validation
}) {
  const [guest, setGuest] = useState({
    first: editing?.first || "",
    last: editing?.last || "",
    title: editing?.title || "",
    organization: editing?.organization || "Harborline Community Bank",
    email: editing?.email || "",
  })
  const [dietary, setDietary] = useState(editing?.dietary || "")
  const [accessibility, setAccessibility] = useState(
    editing?.accessibility || "",
  )
  const [extrasOpen, setExtrasOpen] = useState(
    Boolean(editing?.dietary || editing?.accessibility),
  )
  const [errors, setErrors] = useState<
    Partial<Record<"first" | "last" | "email", string>>
  >({})
  const firstRef = useRef<HTMLInputElement>(null)
  const lastRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const submit = () => {
    const trimmedGuest = {
      first: guest.first.trim(),
      last: guest.last.trim(),
      title: guest.title.trim(),
      organization: guest.organization.trim(),
      email: guest.email.trim(),
    }
    const nextErrors: typeof errors = {}
    if (!trimmedGuest.first) nextErrors.first = validationMessages.required
    if (!trimmedGuest.last) nextErrors.last = validationMessages.required
    if (!trimmedGuest.email) {
      nextErrors.email = validationMessages.required
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedGuest.email)) {
      nextErrors.email = validationMessages.invalidEmail
    }
    setErrors(nextErrors)
    if (nextErrors.first) {
      firstRef.current?.focus()
      return
    }
    if (nextErrors.last) {
      lastRef.current?.focus()
      return
    }
    if (nextErrors.email) {
      emailRef.current?.focus()
      return
    }
    onSave({
      ...trimmedGuest,
      dietary: dietary.trim(),
      accessibility: accessibility.trim(),
    })
  }
  const update = (key: keyof typeof guest) => (value: string) => {
    setGuest((current) => ({ ...current, [key]: value }))
    if (key === "first" || key === "last" || key === "email") {
      setErrors((current) => ({ ...current, [key]: undefined }))
    }
  }
  return (
    <>
      <main className="page has-sticky-action">
        <BackButton onClick={() => go(editing ? "seats" : "choose")} />
        <section className="screen-heading compact">
          <p className="eyebrow">{editing ? "Edit guest" : "Add one by one"}</p>
          <h1>Seat {seat}</h1>
        </section>
        <div className="single-layout">
          <BadgePreview guest={guest} seat={seat} assigned={!editing} />
          <form
            className="glass-card guest-form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            <div className="two-fields">
              <Field
                label="First name"
                required
                value={guest.first}
                onChange={update("first")}
                error={errors.first}
                inputRef={firstRef}
              />
              <Field
                label="Last name"
                required
                value={guest.last}
                onChange={update("last")}
                error={errors.last}
                inputRef={lastRef}
              />
            </div>
            <Field
              label="Title (as on badge)"
              value={guest.title}
              onChange={update("title")}
            />
            <Field
              label="Organization"
              value={guest.organization}
              onChange={update("organization")}
            />
            <Field
              label="Email"
              type="email"
              required
              value={guest.email}
              onChange={update("email")}
              caption="We’ll send their QR ticket here."
              error={errors.email}
              inputRef={emailRef}
            />
            <button
              type="button"
              className="extras-toggle"
              onClick={() => setExtrasOpen(!extrasOpen)}
              aria-expanded={extrasOpen}
            >
              <span>{extrasOpen ? "−" : "+"}</span> Add dietary or accessibility
              needs
            </button>
            {extrasOpen && (
              <div className="extras-fields">
                <Field
                  label="Dietary needs"
                  value={dietary}
                  onChange={setDietary}
                />
                <Field
                  label="Accessibility needs"
                  value={accessibility}
                  onChange={setAccessibility}
                />
              </div>
            )}
          </form>
        </div>
      </main>
      <div className="sticky-action">
        <div className="split-actions">
          <Button
            variant="secondary"
            onClick={() => go(editing ? "seats" : "choose")}
          >
            Cancel
          </Button>
          <Button onClick={submit}>Save guest</Button>
        </div>
      </div>
    </>
  )
}

function SeatRow({ guest, onClick, t, language, galaNight }: SeatRowProps) {
  if (guest.status === "empty") {
    return (
      <article className="seat-row empty-seat-card">
        <span className="seat-number">{guest.seat}</span>
        <span className="empty-seat-message">
          <Icon name="warning" size={17} />
          <strong>{t.emptySeatNeedsGuest}</strong>
        </span>
        <Button onClick={onClick}>{t.nameThisGuest}</Button>
      </article>
    )
  }

  const arrivalTime = GALA_ARRIVAL_TIMES[guest.seat]
  return (
    <button
      className={`seat-row ${galaNight ? "gala-night" : ""}`}
      onClick={onClick}
    >
      <span className="seat-number">{guest.seat}</span>
      <span className="seat-person">
        <strong>{`${guest.first} ${guest.last}`}</strong>
        <small>
          {guest.title} · {guest.organization}
        </small>
        {galaNight && guest.status === "confirmed" && (
          <span className={`arrival-chip ${arrivalTime ? "arrived" : "pending"}`}>
            {arrivalTime
              ? t.arrivedAt(fmtDate(language, arrivalTime, "time"))
              : t.notArrived}
          </span>
        )}
      </span>
      {(!galaNight || guest.status !== "confirmed") && (
        <StatusChip status={guest.status} />
      )}
      <Icon name="chevron" size={20} />
    </button>
  )
}

function YourSeats({
  go,
  t,
  language,
  guests,
  galaNight,
  onSelect,
}: {
  go: (screen: Screen) => void
  t: Dict
  language: Language
  guests: Guest[]
  galaNight: boolean
  onSelect: (guest: Guest) => void
}) {
  const [filter, setFilter] = useState<"all" | "empty" | "named">("all")
  const confirmed = guests.filter(
    (guest) => guest.status === "confirmed",
  ).length
  const waiting = guests.filter((guest) => guest.status === "waiting").length
  const empty = guests.filter((guest) => guest.status === "empty").length
  const visible = guests.filter(
    (guest) =>
      filter === "all" ||
      (filter === "empty"
        ? guest.status === "empty"
        : guest.status !== "empty"),
  )
  return (
    <main className="page seats-page">
      <BackButton onClick={() => go("home")} />
      <section className="screen-heading compact">
        <p className="eyebrow">Guest list</p>
        <h1>Your 20 seats</h1>
      </section>
      <div className="summary-chips" aria-label="Seat summary">
        <span className="confirmed">✓ {confirmed} confirmed</span>
        <span className="waiting">! {waiting} waiting</span>
        <span className="empty">— {empty} empty</span>
      </div>
      <div className="filters" role="group" aria-label="Filter seats">
        {(["all", "empty", "named"] as const).map((item) => (
          <button
            key={item}
            className={filter === item ? "active" : ""}
            onClick={() => setFilter(item)}
          >
            {item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>
      <section className="glass-card seats-list">
        {visible.map((guest) => (
          <SeatRow
            key={guest.seat}
            guest={guest}
            t={t}
            language={language}
            galaNight={galaNight}
            onClick={() => onSelect(guest)}
          />
        ))}
      </section>
    </main>
  )
}

function GuestSheet({
  guest,
  t,
  language,
  onClose,
  onEdit,
  onRemove,
}: {
  guest: Guest
  t: Dict
  language: Language
  onClose: () => void
  onEdit: () => void
  onRemove: () => void
}) {
  const [confirm, setConfirm] = useState(false)
  return (
    <div
      className="sheet-scrim"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="bottom-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-sheet-title"
      >
        <div className="sheet-handle" />
        <button className="sheet-close" onClick={onClose} aria-label="Close">
          <Icon name="close" size={20} />
        </button>
        <div className="sheet-person">
          <span className="avatar">
            {guest.first[0]}
            {guest.last[0]}
          </span>
          <div>
            <p>Seat {guest.seat}</p>
            <h2 id="guest-sheet-title">
              {guest.first} {guest.last}
            </h2>
            <StatusChip status={guest.status} />
          </div>
        </div>
        <dl className="details-list">
          <div>
            <dt>Title</dt>
            <dd>{guest.title}</dd>
          </div>
          <div>
            <dt>Organization</dt>
            <dd>{guest.organization}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{guest.email}</dd>
          </div>
          {guest.dietary && (
            <div>
              <dt>{t.dietaryLabel}</dt>
              <dd>{guest.dietary}</dd>
            </div>
          )}
          {guest.accessibility && (
            <div>
              <dt>{t.accessLabel}</dt>
              <dd>{guest.accessibility}</dd>
            </div>
          )}
          {guest.updatedAt && (
            <div>
              <dt>{t.lastUpdated}</dt>
              <dd>{fmtDate(language, guest.updatedAt, "dateTime")}</dd>
            </div>
          )}
        </dl>
        {!confirm ? (
          <div className="sheet-actions">
            <Button variant="secondary" onClick={onEdit}>
              Edit details
            </Button>
            <Button onClick={onEdit}>Replace with another person</Button>
            <Button variant="danger" onClick={() => setConfirm(true)}>
              Remove from seat
            </Button>
          </div>
        ) : (
          <div className="confirm-box">
            <strong>
              Remove {guest.first} from seat {guest.seat}?
            </strong>
            <p>The seat will become empty. You can add someone else later.</p>
            <div>
              <Button variant="secondary" onClick={() => setConfirm(false)}>
                Keep guest
              </Button>
              <Button variant="danger" onClick={onRemove}>
                Yes, remove
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function Saved({
  go,
  t,
}: {
  go: (screen: Screen) => void
  t: typeof translations.EN
}) {
  return (
    <main className="page saved-page">
      <section className="glass-card saved-card">
        <span className="success-icon">
          <Icon name="check" size={42} />
        </span>
        <p className="eyebrow">Guest list updated</p>
        <h1>{t.saved}</h1>
        <p>{t.savedBody}</p>
        <Button onClick={() => go("seats")}>
          {t.backSeats}
          <Icon name="chevron" size={20} />
        </Button>
      </section>
    </main>
  )
}

type CheckInGuest = {
  first: string
  last: string
  title: string
  organization: string
  table: number
  vip?: boolean
  checkedIn?: string
}

const checkInGuests: CheckInGuest[] = [
  {
    first: "Evelyn",
    last: "Park",
    title: "Chief Executive Officer",
    organization: "Harborline Community Bank",
    table: 2,
  },
  {
    first: "Arthur",
    last: "Wong",
    title: "Executive Director",
    organization: "Meridian Family Foundation",
    table: 4,
    vip: true,
  },
  {
    first: "Marcus",
    last: "Bell",
    title: "Chief Financial Officer",
    organization: "Harborline Community Bank",
    table: 2,
    checkedIn: "7:05 PM by Kenji",
  },
]

function ArrivalProgress({ arrived }: { arrived: number }) {
  const offset = 88 - (arrived / 540) * 88
  return (
    <span className="arrival-progress" aria-hidden="true">
      <svg viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="14" />
        <circle
          className="arrival-progress-value"
          cx="18"
          cy="18"
          r="14"
          strokeDasharray="88"
          strokeDashoffset={offset}
        />
      </svg>
    </span>
  )
}

function CheckInTopBar({
  arrived,
  offline,
  onToggleOffline,
  onHome,
}: {
  arrived: number
  offline: boolean
  onToggleOffline: () => void
  onHome: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <header className="checkin-topbar">
      <div className="checkin-brand">
        <button
          className="product-logo-button checkin-logo-button"
          onClick={onHome}
          aria-label="Back to home"
          title="Home"
        >
          <Logo inverse />
        </button>
        <span className="checkin-brand-divider" />
        <strong>AAFE Gala 2027 · Check-in</strong>
      </div>
      <div className="arrived-pill">
        <ArrivalProgress arrived={arrived} />
        <span>
          <strong>{arrived}</strong> of 540 arrived
        </span>
      </div>
      <div className="checkin-system">
        <span className={`connection-chip ${offline ? "offline" : "online"}`}>
          <span />
          {offline ? "Offline · check-ins saved on this iPad" : "Online"}
        </span>
        <button
          className="more-button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="More options"
          aria-expanded={menuOpen}
        >
          ···
        </button>
        {menuOpen && (
          <div className="checkin-menu">
            <div className="menu-volunteer">
              <span>Signed in as</span>
              <strong>Kenji M.</strong>
            </div>
            <button>Switch volunteer</button>
            <button className="offline-toggle" onClick={onToggleOffline}>
              <span>
                <strong>Simulate offline</strong>
                <small>Keep check-ins on this iPad</small>
              </span>
              <i className={offline ? "on" : ""}>
                <b />
              </i>
            </button>
            <button>Sign out</button>
          </div>
        )}
      </div>
    </header>
  )
}

function ResultCard({
  guest,
  onCheckIn,
}: {
  guest: CheckInGuest
  onCheckIn: () => void
}) {
  return (
    <article
      className={`checkin-result-card ${guest.checkedIn ? "already-in" : ""}`}
    >
      <div className="result-person">
        <div className="result-name-line">
          {guest.vip && <span className="vip-star">★</span>}
          <h2>
            {guest.first} {guest.last}
          </h2>
        </div>
        <p>
          {guest.title} · {guest.organization}
        </p>
        {guest.vip && (
          <span className="vip-note">VIP · Daniel Seo will be notified</span>
        )}
        {guest.checkedIn && (
          <span className="checked-note">✓ Checked in {guest.checkedIn}</span>
        )}
      </div>
      <strong className="result-table">Table {guest.table}</strong>
      <button
        className="checkin-button"
        disabled={Boolean(guest.checkedIn)}
        onClick={onCheckIn}
      >
        {guest.checkedIn ? "Checked in" : "Check in"}
      </button>
    </article>
  )
}

function UnnamedSponsorCard({ onSelect }: { onSelect: () => void }) {
  return (
    <article className="checkin-result-card sponsor-result-card">
      <div className="result-person">
        <p className="result-kicker">Sponsor guest list</p>
        <h2>Harborline Community Bank</h2>
        <span className="unnamed-chip">8 unnamed seats</span>
      </div>
      <button className="checkin-button orange" onClick={onSelect}>
        Check in a Harborline guest
      </button>
    </article>
  )
}

function UnnamedGuestForm({
  onBack,
  onComplete,
}: {
  onBack: () => void
  onComplete: (name: string) => void
}) {
  const [name, setName] = useState("")
  return (
    <main className="unnamed-guest-screen">
      <button className="checkin-back" onClick={onBack}>
        <Icon name="arrow" size={28} /> Back to search
      </button>
      <div className="unnamed-guest-card">
        <p className="result-kicker">Harborline Community Bank</p>
        <h1>Who are we welcoming?</h1>
        <p>We’ll use one of the sponsor’s 8 open seats.</p>
        <label>
          <span>Guest’s name</span>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="First and last name"
          />
        </label>
        <button
          className="checkin-button orange"
          disabled={!name.trim()}
          onClick={() => onComplete(name.trim())}
        >
          Check in & print badge
        </button>
      </div>
    </main>
  )
}

function NotOnListSheet({
  onClose,
  onSponsor,
  onApproved,
}: {
  onClose: () => void
  onSponsor: () => void
  onApproved: (name: string, approvedBy: string, note: string) => void
}) {
  const [mode, setMode] = useState<"options" | "staff" | "walkin">("options")
  const [guestName, setGuestName] = useState("")
  const [approvedBy, setApprovedBy] = useState("Daniel Seo")
  const [note, setNote] = useState("")
  const options = [
    {
      icon: "users",
      title: "Came with a sponsor",
      detail: "Use one of the sponsor’s open seats",
      action: onSponsor,
    },
    {
      icon: "badge",
      title: "Guest of AAFE staff",
      detail: "A staff member approves at the table",
      action: () => setMode("staff" as const),
    },
    {
      icon: "phone",
      title: "Walk-in",
      detail: "Call the check-in lead",
      action: () => setMode("walkin" as const),
    },
  ]
  return (
    <div
      className="checkin-sheet-scrim"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="checkin-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="not-list-title"
      >
        <div className="checkin-sheet-handle" />
        {mode === "options" ? (
          <>
            <h2 id="not-list-title">Not on the list?</h2>
            <div className="not-list-options">
              {options.map((option) => (
                <button key={option.title} onClick={option.action}>
                  <span className="not-list-icon">
                    <Icon name={option.icon} size={32} />
                  </span>
                  <span>
                    <strong>{option.title}</strong>
                    <small>{option.detail}</small>
                  </span>
                  <Icon name="chevron" size={26} />
                </button>
              ))}
            </div>
            <button className="checkin-cancel" onClick={onClose}>
              Cancel
            </button>
          </>
        ) : (
          <form
            className="walkin-form"
            onSubmit={(event) => {
              event.preventDefault()
              onApproved(guestName, approvedBy, note)
            }}
          >
            <button
              type="button"
              className="walkin-back"
              onClick={() => setMode("options")}
            >
              <Icon name="arrow" size={21} />
              Back
            </button>
            <h2 id="not-list-title">
              {mode === "staff" ? "Guest of AAFE staff" : "Walk-in"}
            </h2>
            <div className="walkin-fields">
              <label>
                <span>Guest name</span>
                <input
                  required
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                />
              </label>
              <label>
                <span>Approved by</span>
                <select
                  value={approvedBy}
                  onChange={(event) => setApprovedBy(event.target.value)}
                >
                  <option>Daniel Seo</option>
                  <option>Mei Lin Ortiz</option>
                  <option>Priya Raman</option>
                </select>
              </label>
              <label>
                <span>
                  Note <small>Optional</small>
                </span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
            </div>
            <button
              className="checkin-button orange"
              disabled={!guestName.trim()}
              type="submit"
            >
              Check in & print badge
            </button>
          </form>
        )}
      </section>
    </div>
  )
}

function CheckInSuccess({
  firstName,
  organization,
  table,
  approvedBy,
  onDone,
}: {
  firstName: string
  organization?: string
  table?: number
  approvedBy?: string
  onDone: () => void
}) {
  const [badgeReady, setBadgeReady] = useState(false)
  useEffect(() => {
    const badgeTimer = window.setTimeout(() => setBadgeReady(true), 1200)
    const returnTimer = window.setTimeout(onDone, 3000)
    return () => {
      window.clearTimeout(badgeTimer)
      window.clearTimeout(returnTimer)
    }
  }, [onDone])
  return (
    <button
      className="checkin-success"
      onClick={onDone}
      aria-label="Return to check-in"
    >
      <span className="checkin-success-icon">
        <Icon name="check" size={84} />
      </span>
      <h1>Welcome, {firstName}</h1>
      {table ? (
        <p className="success-table">Table {table}</p>
      ) : (
        <p className="success-table">{organization}</p>
      )}
      <p className={badgeReady ? "badge-ready" : "badge-printing"}>
        {badgeReady ? "✓ Badge ready" : "Badge printing…"}
      </p>
      {approvedBy && (
        <span className="success-approval">Approved by {approvedBy}</span>
      )}
      <span className="success-hint">Tap anywhere to continue</span>
      <span className="success-progress" />
    </button>
  )
}

function CheckInApp({ onHome }: { onHome: () => void }) {
  const [query, setQuery] = useState("")
  const [offline, setOffline] = useState(false)
  const [arrived, setArrived] = useState(212)
  const [notOnList, setNotOnList] = useState(false)
  const [unnamedForm, setUnnamedForm] = useState(false)
  const [ticketCodeOpen, setTicketCodeOpen] = useState(false)
  const [ticketCode, setTicketCode] = useState("")
  const [success, setSuccess] = useState<{
    firstName: string
    organization?: string
    table?: number
    approvedBy?: string
  } | null>(null)

  const completeCheckIn = (guest: {
    firstName: string
    organization?: string
    table?: number
    approvedBy?: string
  }) => {
    setArrived((current) => current + 1)
    setSuccess(guest)
  }

  if (success) {
    return (
      <div className="checkin-shell">
        <CheckInSuccess
          {...success}
          onDone={() => {
            setSuccess(null)
            setQuery("")
          }}
        />
      </div>
    )
  }

  return (
    <div className="checkin-shell">
      <CheckInTopBar
        arrived={arrived}
        offline={offline}
        onToggleOffline={() => setOffline(!offline)}
        onHome={onHome}
      />
      {unnamedForm ? (
        <UnnamedGuestForm
          onBack={() => setUnnamedForm(false)}
          onComplete={(name) =>
            completeCheckIn({
              firstName: name.split(" ")[0],
              organization: "Harborline Community Bank",
            })
          }
        />
      ) : (
        <main className={`checkin-main ${query ? "showing-results" : ""}`}>
          <div className="checkin-search-wrap">
            <Icon name="search" size={34} />
            <label>
              <span>Guest search</span>
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Type a guest name or company"
              />
            </label>
            {query && (
              <button onClick={() => setQuery("")} aria-label="Clear search">
                <Icon name="close" size={24} />
              </button>
            )}
          </div>
          {!query ? (
            <div className="checkin-ready">
              <button
                className="scan-button"
                onClick={() =>
                  completeCheckIn({
                    firstName: "Evelyn",
                    organization: "Harborline Community Bank",
                    table: 2,
                  })
                }
              >
                <Icon name="camera" size={34} /> Scan QR code
              </button>
              <button
                className="ticket-code-link"
                onClick={() => setTicketCodeOpen(!ticketCodeOpen)}
              >
                Enter ticket code
              </button>
              {ticketCodeOpen && (
                <form
                  className="ticket-code-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (!ticketCode.trim()) return
                    completeCheckIn({
                      firstName: "Evelyn",
                      organization: "Harborline Community Bank",
                      table: 2,
                    })
                  }}
                >
                  <label>
                    <span>Ticket code</span>
                    <input
                      autoFocus
                      value={ticketCode}
                      onChange={(event) => setTicketCode(event.target.value)}
                      placeholder="AAFE27-REL-1037"
                    />
                  </label>
                  <button type="submit">Find ticket</button>
                </form>
              )}
              <p>Tip: type the first 3 letters of a name or a company</p>
            </div>
          ) : query.toLowerCase().includes("harborline") ? (
            <section className="checkin-results">
              <p className="results-count">Sponsor found</p>
              <UnnamedSponsorCard onSelect={() => setUnnamedForm(true)} />
            </section>
          ) : (
            <section className="checkin-results">
              <p className="results-count">3 possible matches</p>
              {checkInGuests.map((guest) => (
                <ResultCard
                  key={`${guest.first}-${guest.last}`}
                  guest={guest}
                  onCheckIn={() =>
                    completeCheckIn({
                      firstName: guest.first,
                      organization: guest.organization,
                      table: guest.table,
                    })
                  }
                />
              ))}
            </section>
          )}
        </main>
      )}
      {!unnamedForm && (
        <footer className="checkin-bottom-bar">
          <div className="recent-arrivals">
            <span>Recent:</span>
            {["Sofia Reyes", "Hao Zhang", "Rachel Kim"].map((name) => (
              <button
                key={name}
                onClick={() =>
                  completeCheckIn({ firstName: name.split(" ")[0], table: 2 })
                }
              >
                <span>✓</span> {name}
              </button>
            ))}
          </div>
          <button
            className="not-list-button"
            onClick={() => setNotOnList(true)}
          >
            Not on the list?
          </button>
        </footer>
      )}
      {notOnList && (
        <NotOnListSheet
          onClose={() => setNotOnList(false)}
          onSponsor={() => {
            setNotOnList(false)
            setUnnamedForm(true)
          }}
          onApproved={(name, approver) => {
            setNotOnList(false)
            completeCheckIn({
              firstName: name.split(" ")[0],
              organization: "AAFE Guest",
              approvedBy: approver,
            })
          }}
        />
      )}
    </div>
  )
}

type SeatingGuest = {
  name: string
  title: string
  organization: string
  note?: string
  vip?: boolean
}

type SeatingGroup = {
  sponsor: string
  color: string
  guests: SeatingGuest[]
}

type SeatingTable = {
  id: number
  guests: Array<SeatingGuest | null>
  locked: boolean
}

interface GroupDragPayload {
  kind: "group"
  sponsor: string
}

interface GuestDragPayload {
  kind: "guest"
  sponsor: string
  name: string
}

interface ChairDragPayload {
  kind: "chair"
  tableId: number
  seatIndex: number
}

type DragPayload = GroupDragPayload | GuestDragPayload | ChairDragPayload

interface ActiveDrag {
  payload: DragPayload
  count: number
}

const initialSeatingGroups: SeatingGroup[] = [
  {
    sponsor: "Harborline Community Bank",
    color: "orange",
    guests: [
      {
        name: "Nina Castillo",
        title: "Senior Vice President",
        organization: "Harborline Community Bank",
      },
      {
        name: "Tomás Herrera",
        title: "Community Lending Officer",
        organization: "Harborline Community Bank",
      },
      {
        name: "Wen Li",
        title: "Director of Operations",
        organization: "Harborline Community Bank",
      },
      {
        name: "Grace Odum",
        title: "Board Member",
        organization: "Harborline Community Bank",
      },
    ],
  },
  {
    sponsor: "Meridian Family Foundation",
    color: "purple",
    guests: [
      {
        name: "Lucía Fernández",
        title: "Program Director",
        organization: "Meridian Family Foundation",
        vip: true,
      },
      {
        name: "Jun Ito",
        title: "Senior Advisor",
        organization: "Meridian Family Foundation",
      },
      {
        name: "Patricia Lowe",
        title: "Trustee",
        organization: "Meridian Family Foundation",
      },
    ],
  },
  {
    sponsor: "Acme Community Partners",
    color: "green",
    guests: [
      {
        name: "Samuel Chen",
        title: "Managing Partner",
        organization: "Acme Community Partners",
      },
      {
        name: "Fatima Haddad",
        title: "Director of Programs",
        organization: "Acme Community Partners",
      },
      {
        name: "Brian O'Connell",
        title: "Community Liaison",
        organization: "Acme Community Partners",
      },
    ],
  },
  {
    sponsor: "Pacific Rim Builders",
    color: "blue",
    guests: [
      {
        name: "Hannah Goldfarb",
        title: "Chief Operating Officer",
        organization: "Pacific Rim Builders",
      },
      {
        name: "Tae-yang Park",
        title: "Project Executive",
        organization: "Pacific Rim Builders",
      },
    ],
  },
  {
    sponsor: "Northgate Health Collective",
    color: "rose",
    guests: [
      {
        name: "Omar Siddiqui",
        title: "Medical Director",
        organization: "Northgate Health Collective",
      },
    ],
  },
  {
    sponsor: "Citywide Arts Council",
    color: "amber",
    guests: [
      {
        name: "Elena Petrova",
        title: "Executive Director",
        organization: "Citywide Arts Council",
      },
      {
        name: "Malik Thompson",
        title: "Board Chair",
        organization: "Citywide Arts Council",
      },
    ],
  },
  {
    sponsor: "Queens Youth Alliance",
    color: "teal",
    guests: [
      {
        name: "Jasmine Rivera",
        title: "Youth Programs Lead",
        organization: "Queens Youth Alliance",
      },
    ],
  },
  {
    sponsor: "Friends of AAFE",
    color: "grey",
    guests: [
      {
        name: "Robert Min",
        title: "Community Supporter",
        organization: "Friends of AAFE",
      },
    ],
  },
]

const seat = (
  name: string,
  title: string,
  organization: string,
  note?: string,
): SeatingGuest => ({
  name,
  title,
  organization,
  note,
})

const initialSeatingTables: SeatingTable[] = [
  {
    id: 1,
    locked: true,
    guests: [
      seat("Michelle Tan", "President", "Eastern Community Credit Union"),
      seat("Andre Lewis", "Vice President", "Eastern Community Credit Union"),
      seat("Sana Ahmed", "Director", "Eastern Community Credit Union"),
      seat("Peter Zhou", "Board Member", "Eastern Community Credit Union"),
      seat("Carla Ruiz", "Manager", "Eastern Community Credit Union"),
      seat("Ian Brooks", "Counsel", "Eastern Community Credit Union"),
      seat("Linh Tran", "Advisor", "Eastern Community Credit Union"),
      seat("Erica Moon", "Officer", "Eastern Community Credit Union"),
      seat("Noah Singh", "Guest", "Eastern Community Credit Union"),
      seat("Maya Jones", "Guest", "Eastern Community Credit Union"),
    ],
  },
  {
    id: 2,
    locked: false,
    guests: [
      seat(
        "Evelyn Park",
        "Chief Executive Officer",
        "Harborline Community Bank",
        "Vegetarian meal · Step-free access requested",
      ),
      seat(
        "Marcus Bell",
        "Chief Financial Officer",
        "Harborline Community Bank",
      ),
      seat("Sofia Reyes", "VP, Community Lending", "Harborline Community Bank"),
      seat(
        "Hao Zhang",
        "Branch Manager, Flushing",
        "Harborline Community Bank",
      ),
      seat(
        "Amara Okoye",
        "Director of Philanthropy",
        "Harborline Community Bank",
      ),
      seat("Liam Nguyen", "Board Member", "Harborline Community Bank"),
    ],
  },
  {
    id: 3,
    locked: false,
    guests: [
      seat("Arthur Wong", "Executive Director", "Meridian Family Foundation"),
      seat("Daniel Seo", "Relationship Manager", "Meridian Family Foundation"),
      seat("Mira Shah", "Trustee", "Meridian Family Foundation"),
      seat("Calvin Reed", "Advisor", "Meridian Family Foundation"),
      seat("Annie Lau", "Program Officer", "Meridian Family Foundation"),
      seat("David Kim", "Counsel", "Meridian Family Foundation"),
      seat("Robin Hall", "Guest", "Meridian Family Foundation"),
      seat("May Chen", "Guest", "Meridian Family Foundation"),
    ],
  },
  {
    id: 4,
    locked: false,
    guests: [
      seat("Rachel Kim", "SVP, Operations", "Harborline Community Bank"),
      seat("Hannah Lee", "Development Director", "Pacific Rim Builders"),
      seat("Kevin Yu", "Project Manager", "Pacific Rim Builders"),
    ],
  },
  { id: 5, locked: false, guests: [] },
  {
    id: 6,
    locked: true,
    guests: [
      "Aaron Chen",
      "Leila Haddad",
      "Connor O'Connell",
      "Alicia Gomez",
      "Ravi Mehta",
      "Claire Bernard",
      "Kevin Morales",
      "Jiyoon Choi",
      "Marta Silva",
      "Eric Johnson",
    ].map((name, index) =>
      seat(
        name,
        index === 0 ? "Managing Director" : "Community Partner",
        "Acme Community Partners",
      ),
    ),
  },
  {
    id: 7,
    locked: false,
    guests: [
      seat("Helen Rao", "Chief Medical Officer", "Northgate Health Collective"),
      seat("Jonas Reed", "Director", "Northgate Health Collective"),
      seat("Mina Patel", "Advisor", "Northgate Health Collective"),
      seat("Carl Evans", "Guest", "Northgate Health Collective"),
    ],
  },
  {
    id: 8,
    locked: false,
    guests: [
      "Victor Huang",
      "Grace Lin",
      "Robert Chan",
      "Mei Wong",
      "David Lee",
      "Susan Park",
      "James Ng",
      "Linda Chu",
      "Elaine Ho",
    ].map((name) => seat(name, "Board Member", "AAFE Board")),
  },
  {
    id: 9,
    locked: false,
    guests: [
      seat("Iris Chang", "Community Partner", "Community Partners"),
      seat("Luis Moreno", "Community Partner", "Community Partners"),
    ],
  },
  {
    id: 10,
    locked: false,
    guests: [
      "Daniel Kwan",
      "Jessica Tam",
      "Michael Ko",
      "Angela Yip",
      "Steven Lau",
      "Natalie Fong",
      "Christopher Ma",
    ].map((name, index) =>
      seat(
        name,
        index === 0 ? "President" : "Project Leader",
        "Pacific Rim Builders",
      ),
    ),
  },
  { id: 11, locked: false, guests: [] },
]

function seatedGuests(table: SeatingTable) {
  return table.guests.filter((guest): guest is SeatingGuest => Boolean(guest))
}

function occupiedCount(table: SeatingTable) {
  return seatedGuests(table).length
}

function normalizedSeats(table: SeatingTable) {
  return Array.from({ length: 10 }, (_, index) => table.guests[index] || null)
}

function guestInitials(name: string) {
  const words = name.split(/\s+/).filter(Boolean)
  return `${words[0]?.[0] || ""}${words[words.length - 1]?.[0] || ""}`.toUpperCase()
}

function sponsorColorClass(organization: string) {
  if (organization === "Harborline Community Bank") return "orange"
  if (organization === "Meridian Family Foundation") return "purple"
  if (organization === "Acme Community Partners") return "green"
  if (organization === "Pacific Rim Builders") return "blue"
  if (organization === "Northgate Health Collective") return "rose"
  if (organization === "Citywide Arts Council") return "amber"
  if (organization === "Queens Youth Alliance") return "teal"
  if (organization === "Eastern Community Credit Union") return "slate"
  if (organization === "AAFE Board") return "slate"
  return "grey"
}

function tableHasConflict(table: SeatingTable) {
  const organizations = new Set(
    seatedGuests(table).map((guest) => guest.organization),
  )
  return (
    organizations.has("Harborline Community Bank") &&
    organizations.has("Pacific Rim Builders")
  )
}

function tableSponsorLabel(table: SeatingTable) {
  const organizations = [
    ...new Set(seatedGuests(table).map((guest) => guest.organization)),
  ]
  if (!organizations.length) return "Open seating"
  if (organizations.length <= 2) return organizations.join(" + ")
  return `${organizations[0]} + ${organizations.length - 1} groups`
}

function SeatingTableNode({
  table,
  selected,
  dragging,
  proposed,
  onSelect,
  onDropGuest,
  onDragHover,
  onDragLeave,
}: {
  table: SeatingTable
  selected: boolean
  dragging: ActiveDrag | null
  proposed: boolean
  onSelect: () => void
  onDropGuest: () => void
  onDragHover: () => void
  onDragLeave: () => void
}) {
  const conflict = tableHasConflict(table)
  const count = occupiedCount(table)
  const free = 10 - count
  const enoughSpace = Boolean(
    dragging && free >= dragging.count && !table.locked,
  )
  const noSpace = Boolean(dragging && (!enoughSpace || table.locked))
  const seats = normalizedSeats(table)
  return (
    <div
      className={`floor-table ${table.id === 1 ? "head-table" : ""} ${
        conflict ? "conflict" : ""
      } ${selected ? "selected" : ""} ${proposed ? "proposed" : ""} ${
        enoughSpace ? "can-drop" : ""
      } ${noSpace ? "no-space" : ""}`}
      onDragOver={(event) => {
        event.preventDefault()
        onDragHover()
      }}
      onDragLeave={onDragLeave}
      onDrop={(event) => {
        event.preventDefault()
        onDropGuest()
      }}
    >
      {table.id === 1 && (
        <span className="head-table-label">
          <span>★</span> Head table
        </span>
      )}
      <div className="room-table-wrap">
        {conflict && (
          <span className="room-conflict-icon">
            <Icon name="warning" size={16} />
          </span>
        )}
        {seats.map((guest, index) => (
          <span
            className={`room-seat-dot seat-pos-${index} ${
              guest
                ? `occupied sponsor-${sponsorColorClass(guest.organization)}`
                : "empty"
            } ${proposed && !guest ? "ai-proposed" : ""}`}
            key={index}
          >
            {guest && guestInitials(guest.name)}
            {guest && (
              <span className="seat-tooltip">
                <strong>{guest.name}</strong>
                <span>{guest.title}</span>
                <span>{guest.organization}</span>
                <small>Sponsor: {guest.organization}</small>
              </span>
            )}
          </span>
        ))}
        <button className="room-table-circle" onClick={onSelect}>
          <strong>{table.id}</strong>
          <small>{count} / 10</small>
        </button>
        {noSpace && (
          <span className="space-warning">
            {table.locked ? "Locked" : `Only ${free} seats free`}
          </span>
        )}
      </div>
      <span className="table-sponsor-name">{tableSponsorLabel(table)}</span>
    </div>
  )
}

function UnseatedPanel({
  groups,
  search,
  setSearch,
  collapsed,
  setCollapsed,
  onDrag,
}: {
  groups: SeatingGroup[]
  search: string
  setSearch: (value: string) => void
  collapsed: Record<string, boolean>
  setCollapsed: (sponsor: string) => void
  onDrag: (payload: DragPayload, count: number) => void
}) {
  const total = groups.reduce((sum, group) => sum + group.guests.length, 0)
  const filtered = groups
    .map((group) => ({
      ...group,
      guests: group.guests.filter(
        (guest) =>
          guest.name.toLowerCase().includes(search.toLowerCase()) ||
          group.sponsor.toLowerCase().includes(search.toLowerCase()),
      ),
    }))
    .filter((group) => group.guests.length)
  return (
    <aside className="unseated-panel">
      <div className="seating-search">
        <Icon name="search" size={19} />
        <label>
          <span>Search</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a guest or sponsor"
          />
        </label>
      </div>
      <div className="unseated-heading">
        <h2>Unseated</h2>
        <span>{total}</span>
      </div>
      <div className="unseated-groups">
        {filtered.map((group) => (
          <section className="sponsor-drag-group" key={group.sponsor}>
            <div
              className="sponsor-group-chip"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move"
                onDrag(
                  { kind: "group", sponsor: group.sponsor },
                  group.guests.length,
                )
              }}
            >
              <span className={`group-color ${group.color}`} />
              <button
                onClick={() => setCollapsed(group.sponsor)}
                aria-label={`Toggle ${group.sponsor}`}
              >
                <Icon name="chevron" size={17} />
              </button>
              <span className="sponsor-group-copy">
                <strong>
                  {group.sponsor} · {group.guests.length}
                </strong>
                <small>Drag to seat all</small>
              </span>
              <Icon name="grip" size={20} />
            </div>
            {!collapsed[group.sponsor] && (
              <div className="sponsor-guest-list">
                {group.guests.map((guest) => (
                  <div
                    className="draggable-guest"
                    key={guest.name}
                    draggable
                    onDragStart={(event) => {
                      event.stopPropagation()
                      event.dataTransfer.effectAllowed = "move"
                      onDrag(
                        {
                          kind: "guest",
                          sponsor: group.sponsor,
                          name: guest.name,
                        },
                        1,
                      )
                    }}
                  >
                    <span
                      className={`guest-mini-avatar sponsor-${group.color}`}
                    >
                      {guestInitials(guest.name)}
                    </span>
                    <span>
                      <strong>{guest.name}</strong>
                      <small>{guest.title}</small>
                    </span>
                    <Icon name="grip" size={18} />
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </aside>
  )
}

function TableInspector({
  table,
  onClose,
  onRemove,
  onToggleLock,
}: {
  table: SeatingTable
  onClose: () => void
  onRemove: (guest: SeatingGuest) => void
  onToggleLock: () => void
}) {
  const conflict = tableHasConflict(table)
  return (
    <aside className="table-inspector">
      <div className="inspector-heading">
        <div>
          <p>Selected table</p>
          <h2>Table {table.id}</h2>
        </div>
        <span>{occupiedCount(table)} / 10</span>
        <button onClick={onClose} aria-label="Close inspector">
          <Icon name="close" size={20} />
        </button>
      </div>
      {conflict && (
        <div className="seating-conflict-warning">
          <Icon name="warning" size={22} />
          <p>
            <strong>Keep apart</strong>Harborline Community Bank and Pacific Rim
            Builders are both at this table.
          </p>
        </div>
      )}
      <div className="inspector-seats">
        {Array.from({ length: 10 }, (_, index) => {
          const guest = table.guests[index]
          return (
            <div
              className={`inspector-seat ${guest ? "" : "empty"}`}
              key={index}
            >
              <span className="inspector-seat-number">{index + 1}</span>
              {guest ? (
                <>
                  <span className="inspector-person">
                    <strong>{guest.name}</strong>
                    <small>{guest.organization}</small>
                  </span>
                  <button
                    onClick={() => onRemove(guest)}
                    aria-label={`Remove ${guest.name}`}
                  >
                    <Icon name="close" size={16} />
                  </button>
                </>
              ) : (
                <span className="empty-seat-label">Empty seat</span>
              )}
            </div>
          )
        })}
      </div>
      <label className="lock-table-toggle">
        <span>
          <Icon name="lock" size={19} />
          <strong>Lock table</strong>
        </span>
        <input type="checkbox" checked={table.locked} onChange={onToggleLock} />
        <i>
          <b />
        </i>
      </label>
    </aside>
  )
}

function TableFocus({
  table,
  dragging,
  onClose,
  onPrevious,
  onNext,
  onStartChairDrag,
  onDropSeat,
  onUnseat,
  onMove,
  onToggleLock,
}: {
  table: SeatingTable
  dragging: ActiveDrag | null
  onClose: () => void
  onPrevious: () => void
  onNext: () => void
  onStartChairDrag: (seatIndex: number) => void
  onDropSeat: (seatIndex: number) => void
  onUnseat: (seatIndex: number) => void
  onMove: (seatIndex: number) => void
  onToggleLock: () => void
}) {
  const [dropTarget, setDropTarget] = useState<number | null>(null)
  const [guestPopover, setGuestPopover] = useState<number | null>(null)
  const seats = normalizedSeats(table)
  const selectedGuest = guestPopover === null ? null : seats[guestPopover]
  const conflict = tableHasConflict(table)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
      if (event.key === "ArrowLeft") onPrevious()
      if (event.key === "ArrowRight") onNext()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose, onNext, onPrevious])

  return (
    <div
      className="table-focus-scrim"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      onDragEnd={() => setDropTarget(null)}
    >
      <section
        className="table-focus-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="focus-table-title"
      >
        <button
          className="focus-close"
          onClick={onClose}
          aria-label="Close table focus"
        >
          <Icon name="close" size={21} />
        </button>
        <button
          className="focus-nav previous"
          onClick={onPrevious}
          aria-label="Previous table"
        >
          <Icon name="arrow" size={26} />
        </button>
        <button
          className="focus-nav next"
          onClick={onNext}
          aria-label="Next table"
        >
          <Icon name="chevron" size={26} />
        </button>
        <div className="focus-diagram">
          {seats.map((guest, index) => {
            const nameParts = guest?.name.split(" ") || []
            const lastName = nameParts.pop() || ""
            const firstName = nameParts.join(" ")
            const isTarget = dropTarget === index && Boolean(dragging)
            return (
              <div
                className={`focus-chair-slot chair-pos-${index}`}
                key={index}
              >
                <button
                  className={`focus-chair ${guest ? "occupied" : "empty"} ${
                    isTarget ? "drop-target" : ""
                  }`}
                  draggable={Boolean(guest)}
                  onDragStart={(event) => {
                    if (!guest) return
                    event.dataTransfer.effectAllowed = "move"
                    onStartChairDrag(index)
                  }}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setDropTarget(index)
                  }}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={(event) => {
                    event.preventDefault()
                    setDropTarget(null)
                    onDropSeat(index)
                  }}
                  onClick={() => guest && setGuestPopover(index)}
                >
                  {guest ? (
                    <>
                      <span
                        className={`chair-avatar sponsor-${sponsorColorClass(
                          guest.organization,
                        )}`}
                      >
                        {guestInitials(guest.name)}
                      </span>
                      <span className="chair-name">
                        <strong>{firstName}</strong>
                        <strong>{lastName}</strong>
                      </span>
                    </>
                  ) : (
                    <span>Drop here</span>
                  )}
                  {isTarget && guest && <em>Swap</em>}
                </button>
              </div>
            )
          })}
          <div className={`focus-table-circle ${conflict ? "conflict" : ""}`}>
            {conflict && <Icon name="warning" size={21} />}
            <strong id="focus-table-title">{table.id}</strong>
            <span>{occupiedCount(table)} / 10</span>
          </div>
        </div>
        {guestPopover !== null && selectedGuest && (
          <div className="guest-chair-popover">
            <button
              className="popover-close"
              onClick={() => setGuestPopover(null)}
              aria-label="Close guest details"
            >
              <Icon name="close" size={16} />
            </button>
            <strong>{selectedGuest.name}</strong>
            <span>{selectedGuest.title}</span>
            <span>{selectedGuest.organization}</span>
            <small>Sponsor: {selectedGuest.organization}</small>
            {selectedGuest.note && <p>{selectedGuest.note}</p>}
            <button onClick={() => onMove(guestPopover)}>
              Move to another table
            </button>
            <button
              className="unseat-action"
              onClick={() => {
                onUnseat(guestPopover)
                setGuestPopover(null)
              }}
            >
              Unseat
            </button>
          </div>
        )}
        <div className="focus-summary">
          <strong>
            Table {table.id} · {tableSponsorLabel(table)} ·{" "}
            {occupiedCount(table)} / 10
          </strong>
          {conflict && (
            <div className="seating-conflict-warning">
              <Icon name="warning" size={20} />
              <p>
                <strong>Keep apart</strong>Harborline Community Bank and Pacific
                Rim Builders are both at this table.
              </p>
            </div>
          )}
          <label className="lock-table-toggle">
            <span>
              <Icon name="lock" size={19} />
              <strong>Lock table</strong>
            </span>
            <input
              type="checkbox"
              checked={table.locked}
              onChange={onToggleLock}
            />
            <i>
              <b />
            </i>
          </label>
        </div>
      </section>
    </div>
  )
}

function SeatingApp({ onHome }: { onHome: () => void }) {
  const [view, setView] = useState<"floor" | "list">("floor")
  const [groups, setGroups] = useState(initialSeatingGroups)
  const [tables, setTables] = useState(initialSeatingTables)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [focusId, setFocusId] = useState<number | null>(null)
  const [search, setSearch] = useState("")
  const [collapsed, setCollapsedState] = useState<Record<string, boolean>>({})
  const [dragging, setDragging] = useState<ActiveDrag | null>(null)
  const [, setDragOverId] = useState<number | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const [history, setHistory] = useState<{
    groups: SeatingGroup[]
    tables: SeatingTable[]
  }[]>([])
  const [redo, setRedo] = useState<{
    groups: SeatingGroup[]
    tables: SeatingTable[]
  }[]>([])

  const remember = () => {
    setHistory((current) => [...current, { groups, tables }])
    setRedo([])
  }

  const removePayloadFromGroups = (payload: DragPayload) =>
    payload.kind === "chair"
      ? groups
      : groups
          .map((group) => {
            if (group.sponsor !== payload.sponsor) return group
            if (payload.kind === "group") return { ...group, guests: [] }
            return {
              ...group,
              guests: group.guests.filter(
                (guest) => guest.name !== payload.name,
              ),
            }
          })
          .filter((group) => group.guests.length)

  const guestsForPayload = (payload: DragPayload) => {
    if (payload.kind === "chair") {
      const source = tables.find((table) => table.id === payload.tableId)
      const guest = source?.guests[payload.seatIndex]
      return guest ? [guest] : []
    }
    const group = groups.find((item) => item.sponsor === payload.sponsor)
    if (!group) return []
    return payload.kind === "group"
      ? group.guests
      : group.guests.filter((guest) => guest.name === payload.name)
  }

  const dropOnTable = (tableId: number) => {
    if (!dragging) return
    const table = tables.find((item) => item.id === tableId)
    const movingGuests = guestsForPayload(dragging.payload)
    if (
      !table ||
      table.locked ||
      occupiedCount(table) + movingGuests.length > 10
    ) {
      setDragOverId(null)
      return
    }
    remember()
    setTables((current) => {
      const withoutSource = current.map((item) => {
        if (
          dragging.payload.kind !== "chair" ||
          item.id !== dragging.payload.tableId
        )
          return item
        const seats = normalizedSeats(item)
        seats[dragging.payload.seatIndex] = null
        return { ...item, guests: seats }
      })
      return withoutSource.map((item) => {
        if (item.id !== tableId) return item
        const seats = normalizedSeats(item)
        for (const guest of movingGuests) {
          const emptyIndex = seats.findIndex((seatGuest) => !seatGuest)
          if (emptyIndex >= 0) seats[emptyIndex] = guest
        }
        return { ...item, guests: seats }
      })
    })
    setGroups(removePayloadFromGroups(dragging.payload))
    setDragging(null)
    setDragOverId(null)
    setSelectedId(tableId)
  }

  const dropOnSeat = (tableId: number, seatIndex: number) => {
    if (!dragging) return
    const payload = dragging.payload
    const targetTable = tables.find((table) => table.id === tableId)
    if (!targetTable || targetTable.locked) return
    const movingGuests = guestsForPayload(payload)
    if (!movingGuests.length) return

    if (payload.kind === "chair") {
      remember()
      setTables((current) => {
        const sourceTable = current.find(
          (table) => table.id === payload.tableId,
        )
        const currentTarget = current.find((table) => table.id === tableId)
        if (!sourceTable || !currentTarget) return current
        const sourceSeats = normalizedSeats(sourceTable)
        const targetSeats =
          sourceTable.id === currentTarget.id
            ? sourceSeats
            : normalizedSeats(currentTarget)
        const sourceGuest = sourceSeats[payload.seatIndex]
        const targetGuest = targetSeats[seatIndex]
        sourceSeats[payload.seatIndex] = targetGuest
        targetSeats[seatIndex] = sourceGuest
        return current.map((table) => {
          if (table.id === sourceTable.id)
            return { ...table, guests: sourceSeats }
          if (table.id === currentTarget.id)
            return { ...table, guests: targetSeats }
          return table
        })
      })
    } else {
      const seats = normalizedSeats(targetTable)
      if (seats[seatIndex]) return
      if (10 - occupiedCount(targetTable) < movingGuests.length) return
      remember()
      let nextIndex = seatIndex
      for (const guest of movingGuests) {
        while (nextIndex < 10 && seats[nextIndex]) nextIndex += 1
        if (nextIndex >= 10) {
          nextIndex = seats.findIndex((seatGuest) => !seatGuest)
        }
        if (nextIndex >= 0) seats[nextIndex] = guest
        nextIndex += 1
      }
      setTables((current) =>
        current.map((table) =>
          table.id === tableId ? { ...table, guests: seats } : table,
        ),
      )
      setGroups(removePayloadFromGroups(payload))
    }
    setDragging(null)
  }

  const applySuggestions = () => {
    remember()
    const nextTables = tables.map((table) => ({
      ...table,
      guests: normalizedSeats(table),
    }))
    const prioritizedGroups = [...groups].sort(
      (a, b) =>
        Number(b.guests.some((guest) => guest.vip)) -
        Number(a.guests.some((guest) => guest.vip)),
    )
    for (const group of prioritizedGroups) {
      const target = nextTables.find((table) => {
        if (table.locked || occupiedCount(table) + group.guests.length > 10)
          return false
        const organizations = new Set(
          seatedGuests(table).map((guest) => guest.organization),
        )
        const wouldConflict =
          (group.sponsor === "Harborline Community Bank" &&
            organizations.has("Pacific Rim Builders")) ||
          (group.sponsor === "Pacific Rim Builders" &&
            organizations.has("Harborline Community Bank"))
        return !wouldConflict
      })
      if (target) {
        const seats = normalizedSeats(target)
        for (const guest of group.guests) {
          const emptyIndex = seats.findIndex((seatGuest) => !seatGuest)
          if (emptyIndex >= 0) seats[emptyIndex] = guest
        }
        target.guests = seats
      }
    }
    setTables(nextTables)
    setGroups([])
    setSuggesting(false)
  }

  const selectedTable = tables.find((table) => table.id === selectedId)
  const focusTable = tables.find((table) => table.id === focusId)
  const proposedIds = suggesting
    ? tables
        .filter((table) => !table.locked && occupiedCount(table) < 10)
        .slice(0, 3)
        .map((table) => table.id)
    : []

  return (
    <div className="seating-shell">
      <header className="seating-toolbar">
        <div className="seating-brand">
          <button
            className="product-logo-button seating-logo-button"
            onClick={onHome}
            aria-label="Back to home"
            title="Home"
          >
            <Logo />
          </button>
          <h1>Seating</h1>
        </div>
        <div className="view-toggle" role="group" aria-label="Seating view">
          <button
            className={view === "floor" ? "active" : ""}
            onClick={() => setView("floor")}
          >
            Floor plan
          </button>
          <button
            className={view === "list" ? "active" : ""}
            onClick={() => setView("list")}
          >
            List
          </button>
        </div>
        <div className="seating-toolbar-actions">
          <button
            className="seating-secondary"
            onClick={() => setSuggesting(true)}
          >
            <Icon name="sparkle" size={18} />
            Suggest seating (AI)
          </button>
          <button className="seating-secondary" onClick={() => window.print()}>
            <Icon name="download" size={18} />
            Export PDF
          </button>
          <button
            className="seating-icon-button"
            disabled={!history.length}
            onClick={() => {
              const previous = history[history.length - 1]
              if (!previous) return
              setRedo((current) => [{ groups, tables }, ...current])
              setGroups(previous.groups)
              setTables(previous.tables)
              setHistory((current) => current.slice(0, -1))
            }}
            aria-label="Undo"
          >
            <Icon name="undo" size={20} />
          </button>
          <button
            className="seating-icon-button"
            disabled={!redo.length}
            onClick={() => {
              const next = redo[0]
              if (!next) return
              setHistory((current) => [...current, { groups, tables }])
              setGroups(next.groups)
              setTables(next.tables)
              setRedo((current) => current.slice(1))
            }}
            aria-label="Redo"
          >
            <Icon name="redo" size={20} />
          </button>
        </div>
      </header>
      <div className="seating-workspace" onDragEnd={() => setDragging(null)}>
        <UnseatedPanel
          groups={groups}
          search={search}
          setSearch={setSearch}
          collapsed={collapsed}
          setCollapsed={(sponsor) =>
            setCollapsedState((current) => ({
              ...current,
              [sponsor]: !current[sponsor],
            }))
          }
          onDrag={(payload, count) => setDragging({ payload, count })}
        />
        <main
          className={`seating-canvas ${selectedTable ? "with-inspector" : ""}`}
        >
          {suggesting && (
            <div className="suggestion-banner">
              <Icon name="sparkle" size={22} />
              <p>
                <strong>Suggested seating for 17 guests.</strong> Sponsor groups
                kept together, keep-apart rules respected.
              </p>
              <Button onClick={applySuggestions}>Apply</Button>
              <Button variant="secondary" onClick={() => setSuggesting(false)}>
                Discard
              </Button>
            </div>
          )}
          <div className="stage-bar">STAGE</div>
          {view === "floor" ? (
            <div className="tables-grid">
              {tables.map((table) => (
                <SeatingTableNode
                  key={table.id}
                  table={table}
                  selected={selectedId === table.id}
                  dragging={dragging}
                  proposed={proposedIds.includes(table.id)}
                  onSelect={() => {
                    if (dragging?.payload.kind === "chair") {
                      dropOnTable(table.id)
                      return
                    }
                    setSelectedId(table.id)
                    setFocusId(table.id)
                  }}
                  onDropGuest={() => dropOnTable(table.id)}
                  onDragHover={() => setDragOverId(table.id)}
                  onDragLeave={() => setDragOverId(null)}
                />
              ))}
            </div>
          ) : (
            <div className="seating-list-view">
              {tables.map((table) => (
                <button
                  key={table.id}
                  onClick={() => {
                    setSelectedId(table.id)
                    setFocusId(table.id)
                  }}
                >
                  <span>
                    <strong>Table {table.id}</strong>
                    <small>{tableSponsorLabel(table)}</small>
                  </span>
                  <span className={tableHasConflict(table) ? "conflict" : ""}>
                    {tableHasConflict(table) && (
                      <Icon name="warning" size={17} />
                    )}
                    {occupiedCount(table)} / 10
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="table-legend" aria-label="Table status legend">
            <span>
              <i className="seated" />
              Seated
            </span>
            <span>
              <i className="empty" />
              Empty
            </span>
            <span>
              <Icon name="warning" size={13} />
              Conflict
            </span>
          </div>
          <p className="seating-footer-note">
            Table and seat numbers print on badges automatically.
          </p>
        </main>
        {selectedTable && (
          <TableInspector
            table={selectedTable}
            onClose={() => setSelectedId(null)}
            onRemove={(guest) => {
              remember()
              setTables((current) =>
                current.map((table) =>
                  table.id === selectedTable.id
                    ? {
                        ...table,
                        guests: normalizedSeats(table).map((item) =>
                          item?.name === guest.name ? null : item,
                        ),
                      }
                    : table,
                ),
              )
              setGroups((current) => {
                const existing = current.find(
                  (group) => group.sponsor === guest.organization,
                )
                if (existing) {
                  return current.map((group) =>
                    group.sponsor === guest.organization
                      ? { ...group, guests: [...group.guests, guest] }
                      : group,
                  )
                }
                return [
                  ...current,
                  {
                    sponsor: guest.organization,
                    color: sponsorColorClass(guest.organization),
                    guests: [guest],
                  },
                ]
              })
            }}
            onToggleLock={() => {
              remember()
              setTables((current) =>
                current.map((table) =>
                  table.id === selectedTable.id
                    ? { ...table, locked: !table.locked }
                    : table,
                ),
              )
            }}
          />
        )}
      </div>
      {focusTable && (
        <TableFocus
          table={focusTable}
          dragging={dragging}
          onClose={() => setFocusId(null)}
          onPrevious={() => {
            const previousId = focusTable.id === 1 ? 11 : focusTable.id - 1
            setFocusId(previousId)
            setSelectedId(previousId)
          }}
          onNext={() => {
            const nextId = focusTable.id === 11 ? 1 : focusTable.id + 1
            setFocusId(nextId)
            setSelectedId(nextId)
          }}
          onStartChairDrag={(seatIndex) =>
            setDragging({
              payload: {
                kind: "chair",
                tableId: focusTable.id,
                seatIndex,
              },
              count: 1,
            })
          }
          onDropSeat={(seatIndex) => dropOnSeat(focusTable.id, seatIndex)}
          onUnseat={(seatIndex) => {
            const guest = normalizedSeats(focusTable)[seatIndex]
            if (!guest) return
            remember()
            setTables((current) =>
              current.map((table) => {
                if (table.id !== focusTable.id) return table
                const seats = normalizedSeats(table)
                seats[seatIndex] = null
                return { ...table, guests: seats }
              }),
            )
            setGroups((current) => {
              const existing = current.find(
                (group) => group.sponsor === guest.organization,
              )
              if (existing) {
                return current.map((group) =>
                  group.sponsor === guest.organization
                    ? { ...group, guests: [...group.guests, guest] }
                    : group,
                )
              }
              return [
                ...current,
                {
                  sponsor: guest.organization,
                  color: sponsorColorClass(guest.organization),
                  guests: [guest],
                },
              ]
            })
          }}
          onMove={(seatIndex) => {
            setDragging({
              payload: {
                kind: "chair",
                tableId: focusTable.id,
                seatIndex,
              },
              count: 1,
            })
            setFocusId(null)
          }}
          onToggleLock={() => {
            remember()
            setTables((current) =>
              current.map((table) =>
                table.id === focusTable.id
                  ? { ...table, locked: !table.locked }
                  : table,
              ),
            )
          }}
        />
      )}
    </div>
  )
}

type ProductSection = "portal" | "checkin" | "seating"

interface ProductOption {
  id: ProductSection | "expired" | "gala"
  label: string
}

function PrototypeSwitcher({
  section,
  screen,
  galaNight,
  expiredLabel,
  galaNightLabel,
  onChange,
  onHome,
  onExpired,
  onGalaNight,
}: {
  section: ProductSection
  screen: Screen
  galaNight: boolean
  expiredLabel: string
  galaNightLabel: string
  onChange: (section: ProductSection, ownerWindow: Window | null) => void
  onHome: (ownerWindow?: Window | null) => void
  onExpired: (ownerWindow: Window | null) => void
  onGalaNight: (ownerWindow: Window | null) => void
}) {
  const [open, setOpen] = useState(false)
  const options: ProductOption[] = [
    { id: "portal", label: "Sponsor portal" },
    { id: "gala", label: galaNightLabel },
    { id: "expired", label: expiredLabel },
    { id: "checkin", label: "Check-in" },
    { id: "seating", label: "Seating" },
  ]
  const currentId = section === "portal"
    ? screen === "expired"
      ? "expired"
      : galaNight
        ? "gala"
        : "portal"
    : section
  const current = options.find((option) => option.id === currentId)
  return (
    <div className={`prototype-switcher ${section}`}>
      {open && (
        <div className="prototype-menu">
          {options.map((option) => (
            <button
              key={option.id}
              className={option.id === currentId ? "active" : ""}
              onClick={(event) => {
                const ownerWindow = event.currentTarget.ownerDocument.defaultView
                if (option.id === "portal") {
                  onHome(ownerWindow)
                } else if (option.id === "gala") {
                  onGalaNight(ownerWindow)
                } else if (option.id === "expired") {
                  onExpired(ownerWindow)
                } else {
                  onChange(option.id, ownerWindow)
                }
                setOpen(false)
              }}
            >
              {option.label}
              {option.id === currentId && <span>✓</span>}
            </button>
          ))}
        </div>
      )}
      <button
        className="prototype-trigger"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="prototype-full-label">
          Prototype: {current?.label}
        </span>
        <span className="prototype-compact-label">Prototype</span>
        <span className="prototype-caret">▾</span>
      </button>
    </div>
  )
}

export default function App() {
  const [section, setSection] = useState<ProductSection>("portal")
  const [screen, setScreen] = useState<Screen>("home")
  const [galaNight, setGalaNight] = useState(false)
  const [language, setLanguage] = useState<Language>("EN")
  const [textScale, setTextScale] = useState<TextScale>(1.125)
  const [guests, setGuests] = useState(initialGuests)
  const [selected, setSelected] = useState<Guest | null>(null)
  const [editing, setEditing] = useState<Guest | undefined>()
  const [activity, setActivity] = useState<Activity[]>(initialActivity)
  const [sponsorLogo, setSponsorLogo] = useState("")
  const portalRootRef = useRef<HTMLDivElement>(null)
  const t = translations[language]

  useEffect(() => {
    if (section !== "portal") return
    const ownerWindow = portalRootRef.current?.ownerDocument.defaultView
    if (!ownerWindow) return
    try {
      const savedScale = ownerWindow.localStorage.getItem(TEXT_SCALE_STORAGE_KEY)
      if (
        savedScale === "1" ||
        savedScale === "1.125" ||
        savedScale === "1.25"
      ) {
        setTextScale(Number(savedScale) as TextScale)
      }
    } catch {}
    const syncExpiredHash = () =>
      setScreen((current) => {
        if (ownerWindow.location.hash === "#/expired") return "expired"
        return current === "expired" ? "home" : current
      })
    syncExpiredHash()
    ownerWindow.addEventListener("hashchange", syncExpiredHash)
    return () => ownerWindow.removeEventListener("hashchange", syncExpiredHash)
  }, [section])

  // Every change a sponsor makes is appended here with a timestamp.
  const log = (entry: Omit<Activity, "id" | "at" | "actor">) =>
    setActivity((current) => [
      ...current,
      {
        ...entry,
        id: current.length + 1,
        at: new Date().toISOString(),
        actor: "you",
      },
    ])

  const saveSponsorLogo = (logoUrl: string) => {
    const ownerWindow = portalRootRef.current?.ownerDocument.defaultView
    setSponsorLogo((current) => {
      if (current && ownerWindow) ownerWindow.URL.revokeObjectURL(current)
      return logoUrl
    })
    log({ kind: "logoUploaded" })
  }

  const clearExpiredHash = (ownerWindow?: Window | null) => {
    const targetWindow =
      ownerWindow || portalRootRef.current?.ownerDocument.defaultView
    if (targetWindow?.location.hash === "#/expired") {
      targetWindow.history.replaceState(
        null,
        "",
        `${targetWindow.location.pathname}${targetWindow.location.search}`,
      )
    }
  }

  const goHome = (ownerWindow?: Window | null) => {
    clearExpiredHash(ownerWindow)
    setSection("portal")
    setScreen("home")
    setGalaNight(false)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const showGalaNight = (ownerWindow: Window | null) => {
    clearExpiredHash(ownerWindow)
    setSection("portal")
    setScreen("home")
    setGalaNight(true)
    ownerWindow?.scrollTo({ top: 0, behavior: "smooth" })
  }

  const showExpired = (ownerWindow: Window | null) => {
    setSection("portal")
    setScreen("expired")
    setGalaNight(false)
    if (ownerWindow && ownerWindow.location.hash !== "#/expired") {
      ownerWindow.location.hash = "/expired"
    }
  }

  const changeSection = (
    nextSection: ProductSection,
    ownerWindow: Window | null,
  ) => {
    clearExpiredHash(ownerWindow)
    setGalaNight(false)
    setSection(nextSection)
  }

  const updateTextScale = (
    nextScale: TextScale,
    ownerWindow: Window | null,
  ) => {
    setTextScale(nextScale)
    try {
      ownerWindow?.localStorage.setItem(
        TEXT_SCALE_STORAGE_KEY,
        String(nextScale),
      )
    } catch {}
  }

  const go = (next: Screen) => {
    setSelected(null)
    if (next !== "single") setEditing(undefined)
    setScreen(next)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const selectedSeat = useMemo(
    () => editing?.seat || selected?.seat || 13,
    [editing, selected],
  )
  const selectGuest = (guest: Guest) => {
    if (guest.status === "empty") {
      setEditing(undefined)
      setSelected(guest)
      setScreen("single")
      window.scrollTo({ top: 0, behavior: "smooth" })
    } else {
      setSelected(guest)
    }
  }

  return (
    <>
      {section === "checkin" && <CheckInApp onHome={goHome} />}
      {section === "seating" && <SeatingApp onHome={goHome} />}
      {section === "portal" && (
        <div className="app-shell" ref={portalRootRef}>
          <div className="ambient ambient-one" />
          <div className="ambient ambient-two" />
          <TopBar
            language={language}
            setLanguage={setLanguage}
            textScale={textScale}
            onTextScale={updateTextScale}
            onHome={goHome}
          />
          <div
            className={`portal-content ${
              textScale === 1.25
                ? "text-scale-large"
                : textScale === 1.125
                  ? "text-scale-medium"
                  : "text-scale-default"
            }`}
          >
            {screen === "home" && (
              <Home
                go={go}
                t={t}
                language={language}
                activity={activity}
                guests={guests}
                galaNight={galaNight}
                sponsorLogo={sponsorLogo}
                onLogoSaved={saveSponsorLogo}
              />
            )}
            {screen === "choose" && <Choose go={go} t={t} />}
            {screen === "paste" && (
              <PasteList
                go={go}
                onAdd={() => {
                const now = new Date().toISOString()
                const filled = guests
                  .filter((guest) => parsedGuests[guest.seat - 13])
                  .map((guest) => guest.seat)
                if (filled.length)
                  log({
                    kind: "bulkAdded",
                    count: filled.length,
                    seats: [Math.min(...filled), Math.max(...filled)],
                  })
                setGuests((current) =>
                  current.map((guest) => {
                    const added = parsedGuests[guest.seat - 13]
                    return added
                      ? {
                          ...guest,
                          first: added.first,
                          last: added.last,
                          title: added.title,
                          email: added.email,
                          dietary: "",
                          accessibility: "",
                          status: "waiting",
                          updatedAt: now,
                        }
                      : guest
                  }),
                )
                  go("saved")
                }}
              />
            )}
            {screen === "single" && (
              <SingleGuest
              go={go}
              seat={selectedSeat}
              editing={editing}
              validationMessages={t.validation}
              onSave={(guestDetails) => {
                const before = guests.find((g) => g.seat === selectedSeat)
                const name = `${guestDetails.first} ${guestDetails.last}`.trim()
                if (before) {
                  const previousName = `${before.first} ${before.last}`.trim()
                  const fields = changedFields(before, guestDetails)
                  if (before.status === "empty") {
                    log({ kind: "added", name, seat: selectedSeat })
                  } else if (
                    fields.includes("first") &&
                    fields.includes("last")
                  ) {
                    log({
                      kind: "replaced",
                      name,
                      previousName,
                      seat: selectedSeat,
                    })
                  } else if (fields.length) {
                    log({ kind: "updated", name, seat: selectedSeat, fields })
                  }
                }
                setGuests((current) =>
                  current.map((guest) =>
                    guest.seat === selectedSeat
                      ? {
                          ...guest,
                          ...guestDetails,
                          status: "waiting",
                          updatedAt: new Date().toISOString(),
                        }
                      : guest,
                  ),
                )
                go("saved")
              }}
              />
            )}
            {screen === "seats" && (
              <YourSeats
                go={go}
                t={t}
                language={language}
                guests={guests}
                galaNight={galaNight}
                onSelect={selectGuest}
              />
            )}
            {screen === "saved" && <Saved go={go} t={t} />}
            {screen === "expired" && <ExpiredLink t={t} />}
            {selected && selected.status !== "empty" && screen === "seats" && (
              <GuestSheet
              guest={selected}
              t={t}
              language={language}
              onClose={() => setSelected(null)}
              onEdit={() => {
                setEditing(selected)
                setSelected(null)
                setScreen("single")
              }}
              onRemove={() => {
                log({
                  kind: "removed",
                  name: `${selected.first} ${selected.last}`.trim(),
                  seat: selected.seat,
                })
                setGuests((current) =>
                  current.map((guest) =>
                    guest.seat === selected.seat
                      ? {
                          ...guest,
                          first: "",
                          last: "",
                          title: "",
                          email: "",
                          dietary: "",
                          accessibility: "",
                          status: "empty",
                          updatedAt: new Date().toISOString(),
                        }
                      : guest,
                  ),
                )
                setSelected(null)
              }}
              />
            )}
          </div>
        </div>
      )}
      <PrototypeSwitcher
        section={section}
        screen={screen}
        galaNight={galaNight}
        expiredLabel={t.expiredOption}
        galaNightLabel={t.galaNightOption}
        onChange={changeSection}
        onHome={goHome}
        onExpired={showExpired}
        onGalaNight={showGalaNight}
      />
    </>
  )
}
