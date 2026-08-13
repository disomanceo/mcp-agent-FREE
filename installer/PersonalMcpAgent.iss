#define MyAppName "Personal MCP Agent"
#define MyAppVersion "1.0.6"
#define MyAppPublisher "disomanceo"
#define MyAppURL "https://github.com/disomanceo/personal-mcp-agent"
#define MyAppExeName "Personal MCP Agent.cmd"
#define MyAppStopName "Stop Personal MCP Agent.cmd"
#define MyAppUpdateName "Update Personal MCP Agent.cmd"
#define MyAppRepairName "Repair Personal MCP Agent.cmd"
#define MyAppDoctorName "Run Doctor.cmd"

[Setup]
AppId={{8F04D4F0-980E-4F76-9D6B-F6D56DD4C38D}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName=D:\personal-mcp-agent
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=..\dist-installer
OutputBaseFilename=PersonalMCPAgent-Setup-{#MyAppVersion}
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
SetupLogging=yes
SetupIconFile=..\assets\app-icon.ico

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a Desktop shortcut"; GroupDescription: "Shortcuts:"; Flags: checkedonce

[Files]
Source: "..\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: ".git\*,node_modules\*,dist-installer\*,audit\*,work-smoke\*,.vercel\*,apps\*\dist\*,packages\*\dist\*,apps\*\*.tsbuildinfo,packages\*\*.tsbuildinfo,unins*.dat,unins*.exe,.env,.env.*"

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\assets\app-icon.ico"
Name: "{group}\Stop Personal MCP Agent"; Filename: "{app}\{#MyAppStopName}"; WorkingDir: "{app}"; IconFilename: "{app}\assets\app-icon.ico"
Name: "{group}\Update Personal MCP Agent"; Filename: "{app}\{#MyAppUpdateName}"; WorkingDir: "{app}"; IconFilename: "{app}\assets\app-icon.ico"
Name: "{group}\Repair Personal MCP Agent"; Filename: "{app}\{#MyAppRepairName}"; WorkingDir: "{app}"; IconFilename: "{app}\assets\app-icon.ico"
Name: "{group}\Run Doctor"; Filename: "{app}\{#MyAppDoctorName}"; WorkingDir: "{app}"; IconFilename: "{app}\assets\app-icon.ico"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\assets\app-icon.ico"; Tasks: desktopicon
Name: "{autodesktop}\Stop Personal MCP Agent"; Filename: "{app}\{#MyAppStopName}"; WorkingDir: "{app}"; IconFilename: "{app}\assets\app-icon.ico"; Tasks: desktopicon
Name: "{group}\Thai Quick Start Guide"; Filename: "{app}\docs\QUICKSTART-TH.md"

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\post-install.ps1"" -InstallDir ""{app}"" -WorkspaceRoot ""D:\AI-Workspace"""; WorkingDir: "{app}"; StatusMsg: "Installing dependencies and configuring Personal MCP Agent..."; Flags: waituntilterminated
Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Description: "Start Personal MCP Agent"; Flags: postinstall nowait shellexec skipifsilent
