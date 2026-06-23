import 'package:flutter/material.dart';

/// Helpers for mapping a file name / MIME type to a Material icon and a
/// short type label for the file message bubble.
class FileTypeIcon {
  FileTypeIcon._();

  static String extensionOf(String fileName) {
    final idx = fileName.lastIndexOf('.');
    if (idx == -1 || idx == fileName.length - 1) return '';
    return fileName.substring(idx + 1).toLowerCase();
  }

  static IconData iconFor(String? fileName, [String? mimeType]) {
    final ext = extensionOf(fileName ?? '');
    final mt = (mimeType ?? '').toLowerCase();

    if (ext == 'pdf' || mt == 'application/pdf') return Icons.picture_as_pdf;
    if ({'doc', 'docx'}.contains(ext) ||
        mt.contains('wordprocessingml') ||
        mt == 'application/msword') {
      return Icons.description;
    }
    if ({'xls', 'xlsx', 'csv'}.contains(ext) ||
        mt.contains('spreadsheetml') ||
        mt == 'application/vnd.ms-excel') {
      return Icons.table_chart;
    }
    if ({'ppt', 'pptx'}.contains(ext) || mt.contains('presentationml')) {
      return Icons.present_to_all;
    }
    if ({'zip', 'rar', '7z', 'tar', 'gz'}.contains(ext) ||
        mt == 'application/zip') {
      return Icons.folder_zip;
    }
    if ({'mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a'}.contains(ext) ||
        mt.startsWith('audio/')) {
      return Icons.music_note;
    }
    if ({'mp4', 'mov', 'avi', 'mkv', 'webm'}.contains(ext) ||
        mt.startsWith('video/')) {
      return Icons.video_file;
    }
    if ({'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'}.contains(ext) ||
        mt.startsWith('image/')) {
      return Icons.image;
    }
    if ({'txt', 'md', 'log'}.contains(ext) || mt.startsWith('text/')) {
      return Icons.text_snippet;
    }
    return Icons.insert_drive_file;
  }

  static String labelFor(String? fileName, [String? mimeType]) {
    final ext = extensionOf(fileName ?? '');
    if (ext.isNotEmpty) return ext.toUpperCase();
    final mt = (mimeType ?? '').toLowerCase();
    if (mt.isEmpty) return 'FILE';
    final slash = mt.indexOf('/');
    return slash == -1 ? mt.toUpperCase() : mt.substring(slash + 1).toUpperCase();
  }
}
