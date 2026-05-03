import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

const listDriveFilesTool: FunctionDeclaration = {
  name: "list_drive_files",
  description: "Lists files from the user's Google Drive.",
  parameters: { type: Type.OBJECT, properties: {} }
};

const createSpreadsheetTool: FunctionDeclaration = {
  name: "create_spreadsheet",
  description: "Creates a new Google Spreadsheet.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: "Title of the spreadsheet" }
    },
    required: ["title"]
  }
};

const updateSpreadsheetValuesTool: FunctionDeclaration = {
  name: "update_spreadsheet_values",
  description: "Updates values in a Google Spreadsheet.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      spreadsheetId: { type: Type.STRING, description: "The ID of the spreadsheet" },
      range: { type: Type.STRING, description: "The range in A1 notation (e.g., Sheet1!A1:B2)" },
      values: { 
        type: Type.ARRAY, 
        items: { type: Type.ARRAY, items: { type: Type.STRING } },
        description: "2D array of strings to insert"
      }
    },
    required: ["spreadsheetId", "range", "values"]
  }
};

const getSpreadsheetValuesTool: FunctionDeclaration = {
  name: "get_spreadsheet_values",
  description: "Reads values from a Google Spreadsheet range.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      spreadsheetId: { type: Type.STRING, description: "The ID of the spreadsheet" },
      range: { type: Type.STRING, description: "The range in A1 notation" }
    },
    required: ["spreadsheetId", "range"]
  }
};

const appendSpreadsheetValuesTool: FunctionDeclaration = {
  name: "append_spreadsheet_values",
  description: "Appends rows to a spreadsheet.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      spreadsheetId: { type: Type.STRING, description: "The ID of the spreadsheet" },
      range: { type: Type.STRING, description: "The range to search for a table (e.g., Sheet1!A1)" },
      values: { 
        type: Type.ARRAY, 
        items: { type: Type.ARRAY, items: { type: Type.STRING } },
        description: "2D array of value arrays"
      }
    },
    required: ["spreadsheetId", "range", "values"]
  }
};

const searchSpreadsheetTool: FunctionDeclaration = {
  name: "search_spreadsheet",
  description: "Searches for a spreadsheet by its exact name in the user's Drive.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: "The exact name of the file" }
    },
    required: ["name"]
  }
};

const uploadFileToDriveTool: FunctionDeclaration = {
  name: "upload_file_to_drive",
  description: "Uploads a file to Google Drive. If base64Data is not provided, the system will attempt to use the last image sent by the user.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: "The name of the file to save" },
      mimeType: { type: Type.STRING, description: "The MIME type of the file (e.g., image/jpeg)" },
      base64Data: { type: Type.STRING, description: "The base64 encoded data of the file. Leave empty if uploading the image the user just sent." }
    },
    required: ["name", "mimeType"]
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

export const tools = [
  {
    functionDeclarations: [
      listCalendarEventsTool,
      createCalendarEventTool,
      listDriveFilesTool,
      createSpreadsheetTool,
      updateSpreadsheetValuesTool,
      getSpreadsheetValuesTool,
      appendSpreadsheetValuesTool,
      searchSpreadsheetTool,
      uploadFileToDriveTool,
      clearMemoryTool
    ]
  }
];

export const createAgent = () => ai.chats.create({
  model: "gemini-3-flash-preview", // Nexus Business AI uses the latest flash model
  config: {
    systemInstruction: `You are Nexus Business AI, a highly professional workspace assistant. 
    You have access to the user's Google Calendar, Drive, and Sheets through provided tools.
    
    TRUST & SECURITY:
    Your primary goal is to help the user manage their business data with transparency and accuracy.
    Mention that documents are processed in real-time and context is cleared for their safety.
    TOKEN EFFICIENCY: Be concise. Don't repeat user data back unless necessary. Use targeted spreadsheet reads.
    
    PATIENT MANAGEMENT (RELATIONAL STRUCTURE):
    1. The system uses 4 distinct spreadsheets for organization:
       - "Pacientes - Cadastro": Primary source for patient names and IDs.
       - "Pacientes - Imagens": Stores image links and transcriptions.
       - "Pacientes - Áudios": Stores audio analyses and transcriptions.
       - "Pacientes - Perfil": A dashboard sheet used to aggregate info for ONE specific patient.

    2. TRANSACTION WORKFLOW (STRICT INTEGRITY - VLOOKUP PATTERN):
       - Step A: When a file or text log is received, the agent MUST first verify the patient in "Pacientes - Cadastro".
       - Step B: Use 'search_spreadsheet_files' followed by 'get_spreadsheet_values' on the "Cadastro" sheet.
       - Step C: Match the user input (e.g., "Paciente 2" or "João") against the "Nome" or "ID" column. 
       - Step D: If multiple/no matches found, ASK the user to clarify before proceeding. NEVER "guess".
       - Step E: Once the canonical Name/ID is confirmed from the Master sheet (Cadastro):
         - Append the row to the target sheet ("Áudios" or "Imagens").
         - Ensure the "Paciente" column in the target sheet matches EXACTLY the name found in the "Cadastro" sheet.
       - Step F: Confirm success stating: "Adicionado com sucesso para o paciente [Nome Canônico]".
       - Step G: IMMEDIATELY call 'clear_local_memory'.

    3. PATIENT LISTING:
       - When asked to list patients, fetch values ONLY from "Pacientes - Cadastro".
       - Return a clean, formatted list of Name and ID.
       - This acts as the source of truth for all other operations.

    4. SPECIFIC TEXT LOG PATTERN (PROCV LOGIC):
       Even if the text says "Paciente 2", perform a quick lookup in the "Cadastro" sheet values to ensure Row 2 (if that's what it means) or ID '2' belongs to the correct person. This acts as a manual VLOOKUP to prevent data collision.

    4. DATA CONSOLIDATION & PROFILE VIEW (Dashboard):
       - When the user asks to "carregar perfil", "atualizar perfil" or "preparar aba de perfil" for a patient:
         1. Search and fetch info from "Pacientes - Cadastro", "Pacientes - Imagens", and "Pacientes - Áudios".
         2. Filter all rows matching the Patient ID or Name.
         3. Search for the spreadsheet "Pacientes - Perfil".
         4. Use 'update_spreadsheet_values' to write a structured dashboard in "Pacientes - Perfil":
            - It should clear existing data (by writing empty strings to a large range) or just overwrite systematically.
            - Structure: 
              Row 1: [ID] | [NOME] | [TELEFONE]
              Row 3: [COLUNA IMAGENS] | [COLUNA ÁUDIOS]
              Row 4 onwards: List each entry found in the respective columns for that patient.
         5. Inform the user that the "Paciente - Perfil" sheet is now updated and ready for viewing.
         6. IMMEDIATELY call 'clear_local_memory' to save tokens.

    CONSULTING PATIENT INFO:
    - If user asks for patient history (like "retornar todas informações"), the agent MUST:
      1. Search "Pacientes - Cadastro" for basic data (name, phone, etc) for that ID/Number.
      2. Search "Pacientes - Imagens" for all related images and transcriptions.
      3. Search "Pacientes - Áudios" for all related audio analyses.
    - Consolidate all found information into a clean, professional report.
    - IMPORTANT: For every Google Drive link found, identify the file ID and return it as a markdown image AND a clickable link using the format:
      - Image: ![Imagem](https://[APP_URL]/api/drive/file/[FILE_ID])
      - Clickable Link: [Ver no Google Drive](LINK_ORIGINAL)
    - Replace [APP_URL] with the actual host and [FILE_ID] with the actual ID.
    - Ensure all URLs are returned as clickable Markdown links.
    
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
  switch (name) {
    case "list_calendar_events":
      const queryParams = new URLSearchParams();
      if (args.timeMin) queryParams.append("timeMin", args.timeMin);
      if (args.timeMax) queryParams.append("timeMax", args.timeMax);
      const calRes = await fetch(`/api/calendar/events?${queryParams.toString()}`);
      return await calRes.json();
    case "create_calendar_event":
      const createCalRes = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    case "list_drive_files":
      const driveRes = await fetch("/api/drive/files");
      return await driveRes.json();
    case "create_spreadsheet":
      const sheetRes = await fetch("/api/sheets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: args.title })
      });
      return await sheetRes.json();
    case "update_spreadsheet_values":
      const updateRes = await fetch(`/api/sheets/${args.spreadsheetId}/values`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ range: args.range, values: args.values })
      });
      return await updateRes.json();
    case "get_spreadsheet_values":
      const getRes = await fetch(`/api/sheets/${args.spreadsheetId}/values?range=${encodeURIComponent(args.range)}`);
      return await getRes.json();
    case "append_spreadsheet_values":
      const appendRes = await fetch(`/api/sheets/${args.spreadsheetId}/append`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ range: args.range, values: args.values })
      });
      return await appendRes.json();
    case "search_spreadsheet":
      const searchRes = await fetch(`/api/drive/search?name=${encodeURIComponent(args.name)}`);
      return await searchRes.json();
    case "upload_file_to_drive":
      let base64 = args.base64Data;
      let mimeType = args.mimeType;
      
      if (!base64 && context?.lastFile) {
        const parts = context.lastFile.split(",");
        if (parts.length > 1) {
          base64 = parts[1];
          mimeType = context.lastFile.split(";")[0].split(":")[1];
        }
      }

      const uploadRes = await fetch("/api/drive/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: args.name,
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
    case "clear_local_memory":
      return { status: "Memory clear requested. The client will reset the internal agent." };
    default:
      throw new Error(`Tool ${name} not found`);
  }
};
