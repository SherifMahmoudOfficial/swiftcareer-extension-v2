class ChatThread {
  final String id;
  final String userId;
  final String title;
  final String? jobContext;
  final String? userInstructions;
  final String? focusLabel;
  final String? threadMemory;
  final DateTime? threadMemoryUpdatedAt;
  final int? threadMemoryMessageCount;
  final DateTime createdAt;
  final DateTime updatedAt;

  ChatThread({
    required this.id,
    required this.userId,
    required this.title,
    this.jobContext,
    this.userInstructions,
    this.focusLabel,
    this.threadMemory,
    this.threadMemoryUpdatedAt,
    this.threadMemoryMessageCount,
    DateTime? createdAt,
    DateTime? updatedAt,
  })  : createdAt = createdAt ?? DateTime.now(),
        updatedAt = updatedAt ?? DateTime.now();

  factory ChatThread.fromJson(Map<String, dynamic> json) => ChatThread(
        id: json['id'] as String,
        userId: json['user_id'] as String,
        title: json['title'] as String,
        jobContext: json['job_context'] as String?,
        userInstructions: json['user_instructions'] as String?,
        focusLabel: json['focus_label'] as String?,
        threadMemory: json['thread_memory'] as String?,
        threadMemoryUpdatedAt: json['thread_memory_updated_at'] != null
            ? DateTime.parse(json['thread_memory_updated_at'] as String)
            : null,
        threadMemoryMessageCount:
            (json['thread_memory_message_count'] as num?)?.toInt(),
        createdAt: json['created_at'] != null
            ? DateTime.parse(json['created_at'] as String)
            : null,
        updatedAt: json['updated_at'] != null
            ? DateTime.parse(json['updated_at'] as String)
            : null,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'user_id': userId,
        'title': title,
        'job_context': jobContext,
        'user_instructions': userInstructions,
        'focus_label': focusLabel,
        'thread_memory': threadMemory,
        'thread_memory_updated_at': threadMemoryUpdatedAt?.toIso8601String(),
        'thread_memory_message_count': threadMemoryMessageCount,
        'created_at': createdAt.toIso8601String(),
        'updated_at': updatedAt.toIso8601String(),
      };

  ChatThread copyWith({
    String? id,
    String? userId,
    String? title,
    String? jobContext,
    String? userInstructions,
    String? focusLabel,
    String? threadMemory,
    DateTime? threadMemoryUpdatedAt,
    int? threadMemoryMessageCount,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) =>
      ChatThread(
        id: id ?? this.id,
        userId: userId ?? this.userId,
        title: title ?? this.title,
        jobContext: jobContext ?? this.jobContext,
        userInstructions: userInstructions ?? this.userInstructions,
        focusLabel: focusLabel ?? this.focusLabel,
        threadMemory: threadMemory ?? this.threadMemory,
        threadMemoryUpdatedAt:
            threadMemoryUpdatedAt ?? this.threadMemoryUpdatedAt,
        threadMemoryMessageCount:
            threadMemoryMessageCount ?? this.threadMemoryMessageCount,
        createdAt: createdAt ?? this.createdAt,
        updatedAt: updatedAt ?? this.updatedAt,
      );
}

class ChatMessage {
  final String id;
  final String threadId;
  final String role; // 'user' or 'assistant'
  final String content;
  final String? userId; // owner of the message for RLS
  final Map<String, dynamic>?
      metadata; // JSON metadata for storing component data
  final DateTime createdAt;

  ChatMessage({
    required this.id,
    required this.threadId,
    required this.role,
    required this.content,
    this.userId,
    this.metadata,
    DateTime? createdAt,
  }) : createdAt = createdAt ?? DateTime.now();

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
        id: json['id'] as String,
        threadId: json['thread_id'] as String,
        role: json['role'] as String,
        content: json['content'] as String,
        userId: json['user_id'] as String?,
        metadata: json['metadata'] != null
            ? Map<String, dynamic>.from(json['metadata'] as Map)
            : null,
        createdAt: json['created_at'] != null
            ? DateTime.parse(json['created_at'] as String)
            : null,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'thread_id': threadId,
        'role': role,
        'content': content,
        if (userId != null) 'user_id': userId,
        if (metadata != null) 'metadata': metadata,
        'created_at': createdAt.toIso8601String(),
      };

  ChatMessage copyWith({
    String? id,
    String? threadId,
    String? role,
    String? content,
    String? userId,
    Map<String, dynamic>? metadata,
    DateTime? createdAt,
  }) =>
      ChatMessage(
        id: id ?? this.id,
        threadId: threadId ?? this.threadId,
        role: role ?? this.role,
        content: content ?? this.content,
        userId: userId ?? this.userId,
        metadata: metadata ?? this.metadata,
        createdAt: createdAt ?? this.createdAt,
      );
}
