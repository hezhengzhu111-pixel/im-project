import 'package:im_core/core.dart';

class AiApiKeyUpdateRequest {
  const AiApiKeyUpdateRequest({
    this.provider,
    this.key,
    this.label,
  });

  final String? provider;
  final String? key;
  final String? label;

  Map<String, dynamic> toJson() => {
        if (provider != null) 'provider': provider,
        if (key != null) 'apiKey': key,
        if (label != null) 'keyName': label,
      };
}

class AiSummaryRequest {
  const AiSummaryRequest({
    required this.conversationId,
    this.messageIds,
  });

  final String conversationId;
  final List<String>? messageIds;

  Map<String, dynamic> toJson() => {
        'conversationId': conversationId,
        if (messageIds != null) 'messageIds': messageIds,
      };
}

class AiRagDocUploadRequest {
  const AiRagDocUploadRequest({
    required this.content,
    required this.title,
    this.metadata,
  });

  final String content;
  final String title;
  final Map<String, dynamic>? metadata;

  Map<String, dynamic> toJson() => {
        'content': content,
        'title': title,
        if (metadata != null) 'metadata': metadata,
      };
}

class AiRagQueryRequest {
  const AiRagQueryRequest({
    required this.query,
    this.topK,
    this.filters,
  });

  final String query;
  final int? topK;
  final Map<String, dynamic>? filters;

  Map<String, dynamic> toJson() => {
        'query': query,
        if (topK != null) 'topK': topK,
        if (filters != null) 'filters': filters,
      };
}

class AiApi {
  AiApi(this._httpClient);
  final HttpClientPort _httpClient;

  Future<List<AiApiKey>> getKeys() async {
    final response = await _httpClient.get<List<AiApiKey>>(
      AiEndpoints.keys,
      fromJson: (json) => (json['items'] as List)
          .map((e) => AiApiKey.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
    return response.data;
  }

  Future<AiApiKey> createKey(AiApiKeyCreateRequest request) async {
    final response = await _httpClient.post<AiApiKey>(
      AiEndpoints.keys,
      body: request.toJson(),
      fromJson: AiApiKey.fromJson,
    );
    return response.data;
  }

  Future<AiApiKey> updateKey(String id, AiApiKeyUpdateRequest request) async {
    final response = await _httpClient.put<AiApiKey>(
      AiEndpoints.keyById(id),
      body: request.toJson(),
      fromJson: AiApiKey.fromJson,
    );
    return response.data;
  }

  Future<void> deleteKey(String id) async {
    await _httpClient.delete<void>(
      AiEndpoints.keyById(id),
      fromJson: (_) {},
    );
  }

  Future<String> testKey(String id) async {
    final response = await _httpClient.post<Map<String, dynamic>>(
      AiEndpoints.keyTest(id),
      fromJson: (json) => json,
    );
    return response.data['status'] as String? ?? 'unknown';
  }

  Future<AiSettings> getAiSettings() async {
    final response = await _httpClient.get<AiSettings>(
      AiEndpoints.settings,
      fromJson: AiSettings.fromJson,
    );
    return response.data;
  }

  Future<void> updateAiSettings(AiSettings settings) async {
    await _httpClient.put<void>(
      AiEndpoints.settings,
      body: settings.toJson(),
      fromJson: (_) {},
    );
  }

  Future<Map<String, dynamic>> createSummary(AiSummaryRequest request) async {
    final response = await _httpClient.post<Map<String, dynamic>>(
      AiEndpoints.summary,
      body: request.toJson(),
      fromJson: (json) => json,
    );
    return response.data;
  }

  /// Build the SSE stream URL for a background AI task.
  /// Note: Actual SSE subscription requires a platform-specific SSE adapter.
  /// This method only returns the endpoint path; consumers should build the
  /// full URL with the base API URL and auth token.
  String buildStreamUrl(String taskId) {
    return AiEndpoints.stream(taskId);
  }

  Future<Map<String, dynamic>> uploadRagDoc(
      AiRagDocUploadRequest request) async {
    final response = await _httpClient.post<Map<String, dynamic>>(
      AiEndpoints.ragDocs,
      body: request.toJson(),
      fromJson: (json) => json,
    );
    return response.data;
  }

  Future<List<Map<String, dynamic>>> listRagDocs() async {
    final response = await _httpClient.get<Map<String, dynamic>>(
      AiEndpoints.ragDocs,
      fromJson: (json) => json,
    );
    final items = response.data['items'];
    if (items is List) {
      return items
          .whereType<Map>()
          .map((item) => item.map((key, value) => MapEntry('$key', value)))
          .toList();
    }
    return const [];
  }

  Future<void> deleteRagDoc(String id) async {
    await _httpClient.delete<void>(
      AiEndpoints.ragDocById(id),
      fromJson: (_) {},
    );
  }

  Future<Map<String, dynamic>> queryRag(AiRagQueryRequest request) async {
    final response = await _httpClient.post<Map<String, dynamic>>(
      AiEndpoints.ragQuery,
      body: request.toJson(),
      fromJson: (json) => json,
    );
    return response.data;
  }
}
