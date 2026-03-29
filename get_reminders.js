
const accessToken = process.env.MONICA_ACCESS_TOKEN;

const formatDate = (date) => {
    // We want it to be "Mon 01 Jan"
    const options = { month: 'short', day: '2-digit', weekday: "short" };
    return date.toLocaleDateString("en-GB", options);
}

const combineReminders = (reminders) => {
    const firstDate = reminders[0].date;
    const combinedText = reminders.filter((e) => e.date === firstDate).map(r => r.text).join(', ');
    return [{ date: firstDate, text: combinedText }];
}

const organizeReminders = (reminders) => {
    if (reminders.length === 0) {
      return ['None'];
    }
    const todayNow = new Date();
    const today = new Date(todayNow.getFullYear(), todayNow.getMonth(), todayNow.getDate());
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);

    const upcomingReminders = reminders.map(reminder => {
            // Either the initial date or the next occurrence date should be within the next week
            const initialDate = new Date(reminder.initial_date);
            if (initialDate >= today && initialDate <= nextWeek) {
                return {
                    ...reminder,
                    nextDate: initialDate
                }
            };
            if (reminder.frequency_type === 'year') {
                const nextOccurrence = new Date(today.getFullYear(), initialDate.getMonth(), initialDate.getDate());
                if (nextOccurrence < today) nextOccurrence.setFullYear(nextOccurrence.getFullYear() + 1);
                return {
                    ...reminder,
                    nextDate: nextOccurrence
                }
            }
            return reminder
        })
        .filter((reminder) => reminder.nextDate >= today && reminder.nextDate <= nextWeek)
        .sort((a, b) => a.nextDate - b.nextDate)
        .slice(0, 5) // Limit to next 5 reminders
        .map(reminder => ({date: `${formatDate(reminder.nextDate)}`, text: `${reminder.title} ${reminder.contact.last_name}`}));
    return combineReminders(upcomingReminders);
}

const getReminders = async () => {
  if (!accessToken) {
    return []
  }

  const url = "http://192.168.0.90:8080/api";

try {
    const response = await fetch(`${url}/reminders?limit=100`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      console.error("Failed to fetch reminders:", response.statusText);
      return [];
    }

    const data = await response.json();
    return organizeReminders(data.data || []);
  } catch (error) {
    console.error("Error fetching reminders:", error);
    return [];
  }
}

module.exports = getReminders;