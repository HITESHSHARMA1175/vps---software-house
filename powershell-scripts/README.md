# ⚡ Tally & TSplus One-Click User Provisioning & Zero-Trust Security Engine

Ek powerful, automated PowerShell automation suite jo Windows Server / VPS par naye Tally clients ko **1-Click** me onboard karta hai.

---

## 🚀 Key Features

1. 📂 **Auto-Detect Empty / Dedicated Drives**:
   - Server par available saari drives (`D:`, `E:`, `F:`, etc.) ko scan karta hai.
   - 5 GB empty partition ya khali drive ko automatically select karta hai.
2. 🔤 **Automated Sanitization & Folder Structuring**:
   - Company Name ke spaces ko automatically `_` me convert karta hai (`ABC Traders Pvt Ltd` ➡️ `D:\ABC_Traders_Pvt_Ltd\`).
   - Standard isolated tree structure banata hai:
     - `...\Tally\` (Tally Binaries)
     - `...\Tally\Data\` (Dedicated Tally Company Data)
     - `...\Backup\` (Dedicated Auto-Backup Directory)
     - `...\Documents\` (Client invoices & PDFs)
3. 👤 **Windows Local User & RDP Group Management**:
   - Strong password generator ke saath Windows local user create karta hai.
   - `Remote Desktop Users` group me add karta hai.
   - Optional account expiration date support.
4. 🔒 **Zero-Trust NTFS Security Isolation**:
   - Company root folder par inheritance disable karta hai.
   - **Full Control Access**:
     - ✅ Created Client User (`$Username`)
     - ✅ `BUILTIN\Administrators`
     - ✅ `NT AUTHORITY\SYSTEM`
     - ✅ `Superclient` (Admin user)
   - **Blocked Access**:
     - ❌ `Users`, `Authenticated Users`, `Everyone` (Doosri company ka user is folder ko kabhi nahi khol sakta).
   - **System C: Drive Protection**:
     - User ko Windows system & Tally dependencies run karne ka standard access rehta hai lekin C: drive ka confidential data expose nahi hota.
5. 📊 **Tally Auto-Setup & tally.ini Configuration**:
   - Master Tally template (`C:\Program Files\TallyPrime` ya `C:\TallyMaster`) se fast binaries copy karta hai.
   - `tally.ini` me data path automatically set karta hai: `Data = D:\Company_Name\Tally\Data`.
6. 🖥️ **TSplus Automated Integration**:
   - TSplus application add karta hai: `Company Name - Tally`.
   - TSplus folder add karta hai: `Company Name - Files` (`D:\Company_Name`).
   - User ko **TSplus Floating Panel** assign karta hai aur sirf uski apni Tally & Files assign karta hai (baaki sab hide).
7. 📝 **Audit Receipt & Logging**:
   - Client folder me `Provisioning_Receipt.txt` generate karta hai.
   - Central logs `C:\TallyProvisioningLogs\provisioning_history.log` me record karta hai.

---

## 🛠️ Files Overview

| File | Description |
| :--- | :--- |
| **`Create_Tally_User.bat`** | **1-Click Launcher** (Double-click to open modern GUI with auto Admin UAC prompt). |
| **`Create_Tally_User.ps1`** | Core PowerShell engine (supports both Modern GUI & Silent CLI). |
| **`Audit_Server_Setup.ps1`** | Non-destructive pre-flight script jo drives, Tally aur TSplus scan karta hai. |

---

## 🖱️ How to Use (1-Click GUI Mode)

1. **`Create_Tally_User.bat`** par double-click karein. (Admin UAC popup aayega, `Yes` click karein).
2. Modern GUI khulega:
   - **Company Name**: e.g., `Sharma Building Materials` (Username automatically suggest ho jayega `sharma_building_materials`).
   - **Target Drive**: Khali drive automatically selected hogi.
   - **Password**: Auto-generated strong password hoga (ya custom type karein).
   - **Tally Template**: Server par installed TallyPrime auto-detect ho jayega.
   - **Options**: Expiry date aur TSplus integration checkbox toggle kar sakte hain.
3. **"🚀 PROVISION TALLY USER NOW"** par click karein.
4. 10-15 seconds me complete user, folders, security permissions, Tally aur TSplus configure ho jayenge aur credentials clipboard par copy ho jayenge!

---

## 💻 How to Use in Command Line / API (Silent CLI Mode)

Aap is script ko unattended mode me bhi chala sakte hain:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\Create_Tally_User.ps1 `
  -CompanyName "ABC Traders Pvt Ltd" `
  -Username "abc_traders" `
  -Password "SecurePass#8077" `
  -DriveLetter "D:" `
  -NonInteractive
```

---

## 📋 Security Architecture Diagram

```
[Target Dedicated Drive: D:\]
  │
  └── [D:\ABC_Traders_Pvt_Ltd\]  <-- (NTFS Inheritance Disabled)
        │
        ├── Permissions:
        │     ├── ✅ abc_traders (Full Control)
        │     ├── ✅ Superclient / Administrators (Full Control)
        │     ├── ✅ SYSTEM (Full Control)
        │     └── ❌ Other Users / Everyone (STRICTLY DENIED)
        │
        ├── Tally\
        │     ├── tally.exe
        │     ├── tally.ini (Data = D:\ABC_Traders_Pvt_Ltd\Tally\Data)
        │     └── Data\ (Exclusive Tally Data)
        ├── Backup\
        └── Documents\

[TSplus Portal]
  │
  └── abc_traders Login
        │
        ├── Floating Panel (Enabled)
        ├── Assigned App: "ABC Traders Pvt Ltd - Tally" (Only)
        ├── Assigned Folder: "D:\ABC_Traders_Pvt_Ltd\" (Only)
        └── Other Companies Apps & Folders (Hidden & Denied)
```
