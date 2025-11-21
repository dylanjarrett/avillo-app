// AvilloOS Task List
import TaskItem from './task-item';

export default function TaskList() {
  const tasks = [
    { title: "Follow up with buyer", done: false },
    { title: "Prepare listing packet", done: true },
  ];

  return (
    <div className="space-y-3">
      {tasks.map((t, idx) => (
        <TaskItem key={idx} title={t.title} done={t.done} />
      ))}
    </div>
  );
}
