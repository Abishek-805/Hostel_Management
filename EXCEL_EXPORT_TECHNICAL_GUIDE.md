# Excel Export Implementation - Technical Reference

## 🎯 Overview

This document explains how cross-platform Excel export works in the application.

---

## 📱 Platform Detection

```typescript
import { Platform } from 'react-native';

if (Platform.OS === 'web') {
  // Running in browser (web bundle)
} else {
  // Running on mobile (Android/iOS with Expo)
}
```

**Possible values**:
- `"web"` - Browser (web bundle)
- `"ios"` - Apple iOS
- `"android"` - Android
- `"windows"` - Windows (not used)
- `"macos"` - macOS (not used)

---

## 🌐 WEB EXPORT FLOW

### Execution Path
```
Web → Export Button Click
  ↓
API Request (fetch + blob)
  ↓
Create Object URL
  ↓
Trigger <a> click (browser download)
  ↓
Cleanup (revoke URL, remove element)
  ↓
Browser handles file save
```

### Code Pattern
```typescript
if (Platform.OS === "web") {
  const response = await fetch(exportUrl, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const blob = await response.blob();
  
  // Create URL reference
  const url = window.URL.createObjectURL(blob);
  
  // Create temporary <a> element
  const a = document.createElement('a');
  a.href = url;
  a.download = 'filename.xlsx';
  
  // Trigger download
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  
  // Cleanup
  window.URL.revokeObjectURL(url);
}
```

### Key Details
- ✅ No special permissions needed
- ✅ Uses browser's native download manager
- ✅ User can choose download location
- ✅ Works on all browsers (Chrome, Firefox, Safari, etc)

---

## 📱 MOBILE EXPORT FLOW

### Execution Path
```
Mobile → Export Button Click
  ↓
API Request (file download)
  ↓
Convert blob → base64 (or FileSystem.downloadAsync)
  ↓
Write to cache/document directory
  ↓
Check if Sharing available
  ├─→ YES: Open share sheet
  │        ↓
  │        User chooses app (Mail, Files, Drive, etc)
  │        ↓
  │        File sent to app
  │        ↓
  │        User can view/manage/send file
  │
  └─→ NO: Show success alert
```

### Code Pattern (Blob → Base64 Approach)
```typescript
if (Platform.OS !== "web") {
  const response = await apiRequest("GET", exportUrl);
  const blob = await response.blob();
  
  // Convert blob to base64
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64String = reader.result?.toString().split(',')[1] || '';
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  
  // Write to file system
  const fileName = 'report.xlsx';
  const fileUri = (FileSystem as any).cacheDirectory + fileName;
  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: 'base64',
  });
  
  // Share the file
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri);
  } else {
    Alert.alert("Success", "File saved to device");
  }
}
```

### Alternative Pattern (FileSystem.downloadAsync)
```typescript
// Used in ManageAttendanceScreen
const downloadRes = await FileSystem.downloadAsync(exportUrl, fileUri, {
  headers: { 'Authorization': `Bearer ${token}` }
});

if (downloadRes.status === 200) {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(downloadRes.uri);
  }
}
```

### Key Details
- ✅ API needs Authorization header support
- ✅ File stored temporarily in cache directory
- ✅ Share sheet lets user choose where to save/send
- ✅ Works with Files app, email, cloud storage, etc

---

## 🔄 Implementation Locations

### 1. FoodPollScreen.tsx
**Export endpoint**: `/food-polls/{pollId}/export`

```typescript
const exportPollMutation = useMutation({
  mutationFn: async (pollId: string) => {
    const res = await apiRequest("GET", `/food-polls/${pollId}/export`);
    // ... platform detection and export logic
  }
});
```

**Trigger**: "Export Results as Excel" button

---

### 2. ManageSuggestionsScreen.tsx
**Export endpoint**: `/menu-suggestions/export/excel`

```typescript
const handleExport = async () => {
  const response = await apiRequest("GET", `/menu-suggestions/export/excel`);
  // ... platform detection and export logic
};
```

**Trigger**: Export button near top suggestions

---

### 3. ManageAttendanceScreen.tsx
**Export endpoint**: `/attendances/export-excel`

```typescript
const handleExportExcel = async () => {
  const exportUrl = buildApiUrl("/attendances/export-excel");
  // ... platform detection and export logic
};
```

**Trigger**: Export Excel button

---

## 🗂️ File Storage Paths

### Mobile Directories
```typescript
FileSystem.documentDirectory
  // /data/user/0/host.exp.exponent/files/
  // User can see these files in Files app

FileSystem.cacheDirectory
  // /data/user/0/host.exp.exponent/cache/
  // Temporary, may be cleared by OS
```

### Recommended
- Use `cacheDirectory` for exports (temporary)
- Use `documentDirectory` for persistent user files

---

## 🔐 Authorization Headers

### Web Export
```typescript
const response = await fetch(exportUrl, {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

### Mobile Export
```typescript
const downloadRes = await FileSystem.downloadAsync(exportUrl, fileUri, {
  headers: { 'Authorization': `Bearer ${token}` }
});

// OR: apiRequest already includes headers
const response = await apiRequest("GET", exportUrl);
```

**Important**: Backend must validate Authorization header for export endpoints

---

## ⚠️ Error Handling

### Try/Catch Pattern
```typescript
try {
  // Export logic
} catch (error) {
  console.error("Export Error:", error);
  Alert.alert("Error", "Failed to export file. Please try again.");
} finally {
  setIsExporting(false);  // Reset loading state
}
```

### Expected Errors
- Network error → "Failed to fetch file"
- No sharing available → "Show success alert instead"
- File write failed → "Permission denied"
- Invalid response → "Export failed"

---

## 📊 Backend Requirements

### Excel Response Headers
```
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename=report.xlsx
```

### Example Node.js/Express
```javascript
res.setHeader('Content-Type', 
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
);
res.setHeader('Content-Disposition', 
  'attachment; filename=report.xlsx'
);
res.send(excelBuffer);
```

### Authorization
- Backend should verify `Authorization` header
- Check user's hostelBlock matches requested data
- Return 401 if unauthorized

---

## 🧪 Testing Checklist

### Web Testing
- [ ] Open browser and log in
- [ ] Navigate to export screen
- [ ] Click export button
- [ ] Verify file downloads to Downloads folder
- [ ] Verify filename is correct
- [ ] Open file in Excel/Sheets - data should be intact

### Mobile Testing (Android)
- [ ] Open Expo app
- [ ] Navigate to export screen
- [ ] Click export button
- [ ] Verify share sheet opens
- [ ] Select "Save to Files"
- [ ] Verify in Files app

### Mobile Testing (iOS)
- [ ] Open Expo app
- [ ] Navigate to export screen
- [ ] Click export button
- [ ] Verify share sheet opens
- [ ] Select Mail/iCloud Drive/Files
- [ ] Verify file appears in destination

---

## 🚀 Performance Considerations

### File Size Limits
- Excel files: Usually < 10-50MB
- Base64 encoding: Increases size by ~33%
- Buffer memory: Loaded fully before export

### Optimization Tips
- Limit rows exported (1000-5000 max)
- Compress data before export
- Use streaming on backend if possible

### Loading State
```typescript
const [isExporting, setIsExporting] = useState(false);

// During export
setIsExporting(true);

// Show loading overlay
{isExporting && <BrandedLoadingOverlay />}
```

---

## 📚 Useful Resources

### Expo Documentation
- [FileSystem API](https://docs.expo.dev/modules/file-system/)
- [Sharing API](https://docs.expo.dev/modules/sharing/)

### React Native
- [Platform Module](https://reactnative.dev/docs/platform)

### Excel Generation
- Backend uses ExcelJS or similar
- Formats: .xlsx (modern) vs .xls (legacy)

---

## 🔗 Related Code

### Query Client Setup
```typescript
import { apiRequest } from "@/lib/query-client";

// Already handles authorization
const response = await apiRequest("GET", "/endpoint");
```

### BuildApiUrl Helper
```typescript
import { buildApiUrl } from "@/config/api";

const url = buildApiUrl("/route");  // Full API URL
```

---

## 💡 Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Export fails on mobile | FileSystem permission | Check permissions in app.json |
| Share sheet doesn't open | App configured for web only | Add mobile in platform config |
| Empty file downloaded | API returns wrong format | Check backend Content-Type |
| Large file hangs | Memory limit exceeded | Reduce rows in export |
| File saved but can't find | Cache cleared | Use documentDirectory instead |

---

## 📝 Future Improvements

- [ ] Add export progress indicator for large files
- [ ] Support ZIP exports for multiple files
- [ ] Add custom column selection before export
- [ ] Implement server-side pagination for large datasets
- [ ] Add export scheduling/batch downloads
- [ ] Support CloudKit/iCloud Drive on iOS

---

**Document Version**: 1.0
**Last Updated**: February 27, 2026
**Status**: Reference Documentation
