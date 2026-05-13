import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";

export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const listCalendarEventsTool: FunctionDeclaration = {
  name: "list_calendar_events",
  description: "Lists upcoming events from the user's Google Calendar.",
  parameters: { 
    type: Type.OBJECT, 
    properties: {
      timeMin: { type: Type.STRING, description: "Lower bound (inclusive) for an event's end time to filter by (ISO format)." },
      timeMax: { type: Type.STRING, description: "Upper bound (exclusive) for an event's start time to filter by (ISO format)." }
    }
  }
};

const createCalendarEventTool: FunctionDeclaration = {
  name: "create_calendar_event",
  description: "Creates a new event in the user's Google Calendar. All times MUST be in America/Sao_Paulo timezone.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      summary: { type: Type.STRING, description: "Title of the event" },
      start: { type: Type.STRING, description: "Start time in ISO format (e.g., 2024-05-02T10:00:00)" },
      end: { type: Type.STRING, description: "End time in ISO format" },
      timeZone: { type: Type.STRING, description: "The time zone in which the time is specified. (Default: America/Sao_Paulo)" },
      description: { type: Type.STRING, description: "Description of the event" },
      location: { type: Type.STRING, description: "Location of the event" },
      reminders: {
        type: Type.OBJECT,
        description: "Reminder settings",
        properties: {
          useDefault: { type: Type.BOOLEAN, description: "Whether to use default reminders" },
          overrides: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                method: { type: Type.STRING, description: "Method (popup or email)" },
                minutes: { type: Type.INTEGER, description: "Minutes before the event" }
              }
            }
          }
        }
      },
      attendees: { 
        type: Type.ARRAY, 
        items: { type: Type.STRING }, 
        description: "List of email addresses for attendees" 
      },
      recurrence: { 
        type: Type.ARRAY, 
        items: { type: Type.STRING }, 
        description: "Recurrence rules (e.g., ['RRULE:FREQ=WEEKLY'])" 
      }
    },
    required: ["summary", "start", "end"]
  }
};

const uploadPatientFileTool: FunctionDeclaration = {
  name: "upload_patient_file",
  description: "Uploads a file (image or document) for a specific patient. If base64Data is not provided, the system will attempt to use the last image sent by the user.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      patientId: { type: Type.STRING, description: "The ID of the patient this file belongs to" },
      description: { type: Type.STRING, description: "Brief description of the file (e.g., 'Exames admissionais', 'Foto da ferida')" },
      name: { type: Type.STRING, description: "The name of the file to save" },
      mimeType: { type: Type.STRING, description: "The MIME type of the file (e.g., image/jpeg)" },
      base64Data: { type: Type.STRING, description: "The base64 encoded data of the file. Leave empty if uploading the image the user just sent." }
    },
    required: ["patientId", "name", "mimeType"]
  }
};

const clearMemoryTool: FunctionDeclaration = {
  name: "clear_local_memory",
  description: "Clears the current chat memory to save costs. Call this tool automatically after finishing a task, such as after successfully saving patient data or when the user explicitly asks to clear the memory.",
  parameters: {
    type: Type.OBJECT,
    properties: {}
  }
};

const searchPatientTool: FunctionDeclaration = {
  name: "search_patient",
  description: "Searches for a patient in the database by name or partial name.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: "Name or ID of the patient" }
    },
    required: ["query"]
  }
};

const addPatientLogTool: FunctionDeclaration = {
  name: "add_patient_log",
  description: "Adds a text log (evolution) to a patient's history.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      patientId: { type: Type.STRING, description: "The ID of the patient" },
      text: { type: Type.STRING, description: "The log text to add" }
    },
    required: ["patientId", "text"]
  }
};

const listPatientsTool: FunctionDeclaration = {
  name: "list_patients",
  description: "Lists all patients in the system.",
  parameters: { type: Type.OBJECT, properties: {} }
};

export const tools = [
  {
    functionDeclarations: [
      listCalendarEventsTool,
      createCalendarEventTool,
      uploadPatientFileTool,
      searchPatientTool,
      addPatientLogTool,
      listPatientsTool,
      clearMemoryTool
    ]
  }
];

export const createAgent = () => ai.chats.create({
  model: "gemini-3-flash-preview", 
  config: {
    systemInstruction: `You are Doctor Agent, a highly professional medical workspace assistant. 
    You have access to the user's Google Calendar and the Patient Database (Firestore) through provided tools. 
    Files and images are stored in Firebase Storage.
    
    TRUST & SECURITY:
    Your primary goal is to help the user manage their medical practice data with transparency and accuracy.
    Mention that documents are processed in real-time and context is cleared for their safety.
    TOKEN EFFICIENCY: Be concise. Don't repeat user data back unless necessary.
    
    PATIENT MANAGEMENT (FIRESTORE):
    1. The system uses a centralized database for patients, logs, and files.

    2. WORKFLOW (STRICT INTEGRITY):
       - Step A: When a file or text log is received, you MUST first find the patient using 'search_patient' or 'list_patients'.
       - Step B: Match the user input (e.g., "Paciente 2" or "João") against the results.
       - Step C: If multiple/no matches found, ASK the user to clarify before proceeding. NEVER "guess".
       - Step D: Once the canonical Name/ID is confirmed:
         - For text logs: Use 'add_patient_log'.
         - For files: Use 'upload_patient_file' (this will register it in the database and Storage via the backend).
       - Step E: Confirm success stating: "Arquivo adicionado com sucesso para o paciente [Nome]".
       - Step F: IMMEDIATELY call 'clear_local_memory'.

    3. PATIENT LISTING:
       - Use 'list_patients' to see everyone in the system.
       - Return a clean, formatted list.

    4. DATA CONSOLIDATION & PROFILE VIEW:
       - When the user asks to see a patient's info, profile, or report:
         1. Use 'search_patient' and then present the information found.
         2. Provide a report with:
            - Header: # **[NOME]**, [IDADE] anos
            - Section: **Status:** [Status Atual] - [Hospital]
            - Section: **Informações:** [Last logs/evolution]
         3. IMMEDIATELY call 'clear_local_memory' after providing the report.
    
    CALENDAR & EFFICIENCY:
    - TIMEZONE: ALWAYS use 'America/Sao_Paulo' (GMT-3) for all calendar operations. 
    - NOTIFICATIONS: When the user asks for a notification or alert at a specific time, calculate the 'minutes' before the event and use 'reminders' with method 'popup'.
    - When creating events, omit the 'Z' from ISO strings and pass 'timeZone': 'America/Sao_Paulo'.
    - When listing calendar events, ALWAYS use a clean list format without headers:
    [HH:MM] | [compromisso]

    If the user asks for more than one day (e.g., today and tomorrow), GROUP them like this:
    "Hoje"
    [HH:MM] | [compromisso]

    "Amanhã"
    [HH:MM] | [compromisso]

    - AFTER listing or creating events, ALWAYS call 'clear_local_memory' to keep the conversation efficient and save tokens.

    Current Time (Brasília): ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Use this for relative dates).
    ISO Reference: ${new Date().toISOString()} (UTC).`,
    tools: tools as any,
    toolConfig: { includeServerSideToolInvocations: true }
  }
});

export const executeTool = async (name: string, args: any, context?: { lastFile?: string | null }) => {
  const groupId = localStorage.getItem("activeGroupId");
  const commonHeaders = groupId ? { "x-group-id": groupId } : {};

  switch (name) {
    case "list_calendar_events":
      const queryParams = new URLSearchParams();
      if (args.timeMin) queryParams.append("timeMin", args.timeMin);
      if (args.timeMax) queryParams.append("timeMax", args.timeMax);
      const calRes = await fetch(`/api/calendar/events?${queryParams.toString()}`, {
        headers: { ...commonHeaders }
      });
      return await calRes.json();
    case "create_calendar_event":
      const createCalRes = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...commonHeaders
        },
        body: JSON.stringify({
          summary: args.summary,
          start: { 
            dateTime: args.start,
            timeZone: args.timeZone || "America/Sao_Paulo"
          },
          end: { 
            dateTime: args.end,
            timeZone: args.timeZone || "America/Sao_Paulo"
          },
          reminders: args.reminders || {
            useDefault: false,
            overrides: [
              { method: "popup", minutes: 30 }
            ]
          },
          description: args.description,
          location: args.location,
          attendees: args.attendees?.map((email: string) => ({ email })),
          recurrence: args.recurrence
        })
      });
      return await createCalRes.json();
    case "search_patient": {
      const res = await fetch("/api/app/patients", {
        headers: { ...commonHeaders }
      });
      const patients = await res.json();
      const q = args.query.toLowerCase();
      return patients.filter((p: any) => 
        p.nome.toLowerCase().includes(q) || 
        p.id.toLowerCase().includes(q)
      );
    }
    case "list_patients": {
      const res = await fetch("/api/app/patients", {
        headers: { ...commonHeaders }
      });
      return await res.json();
    }
    case "add_patient_log": {
      const res = await fetch("/api/app/logs", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...commonHeaders
        },
        body: JSON.stringify({ patientId: args.patientId, text: args.text })
      });
      return await res.json();
    }
    case "upload_patient_file": {
      let base64 = args.base64Data;
      let mimeType = args.mimeType;
      
      if (!base64 && context?.lastFile) {
        const parts = context.lastFile.split(",");
        if (parts.length > 1) {
          base64 = parts[1];
          mimeType = context.lastFile.split(";")[0].split(":")[1];
        }
      }

      const uploadRes = await fetch("/api/app/upload-image", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...commonHeaders
        },
        body: JSON.stringify({
          patientId: args.patientId,
          description: args.description || "Upload via IA",
          fileName: args.name,
          mimeType: mimeType || "image/jpeg",
          base64Data: base64
        })
      });
      
      if (!uploadRes.ok) {
        const errorText = await uploadRes.text();
        console.error("Upload error response:", errorText);
        throw new Error(`Upload failed with status ${uploadRes.status}: ${errorText.substring(0, 200)}`);
      }
      
      return await uploadRes.json();
    }
    case "clear_local_memory":
      return { status: "Memory clear requested. The client will reset the internal agent." };
    default:
      throw new Error(`Tool ${name} not found`);
  }
};
